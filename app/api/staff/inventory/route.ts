import { NextResponse } from 'next/server';
import { recordAuditEvent } from '@/lib/audit-events';
import { assertActionPermission, requireStaffContext } from '@/lib/supabase/admin-auth';

export async function GET(request: Request) {
  try {
    const context = await requireStaffContext(request);
    assertActionPermission(context, 'manage_inventory');

    const { data, error } = await context.supabase
      .from('inventory_items')
      .select(`
        id,
        item_code,
        item_name,
        unit,
        linked_lane,
        reorder_threshold,
        on_hand_quantity,
        notes,
        is_active,
        updated_at,
        inventory_transactions (
          id,
          transaction_type,
          quantity,
          resulting_quantity,
          reason,
          created_at
        )
      `)
      .order('item_name', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ items: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load inventory.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireStaffContext(request);
    assertActionPermission(context, 'manage_inventory');

    const body = (await request.json()) as {
      itemId?: string;
      itemCode?: string;
      itemName?: string;
      unit?: string;
      linkedLane?: string | null;
      reorderThreshold?: number;
      notes?: string;
      adjustmentQuantity?: number;
      reason?: string;
    };

    const quantity = Number(body.adjustmentQuantity ?? 0);
    if (body.itemId) {
      const { data: item, error: itemError } = await context.supabase
        .from('inventory_items')
        .select('id, item_name, on_hand_quantity')
        .eq('id', body.itemId)
        .single();

      if (itemError || !item) {
        return NextResponse.json({ error: 'Inventory item not found.' }, { status: 404 });
      }

      const nextQuantity = Number(item.on_hand_quantity ?? 0) + quantity;
      const { error: updateError } = await context.supabase
        .from('inventory_items')
        .update({ on_hand_quantity: nextQuantity })
        .eq('id', body.itemId);

      if (updateError) {
        throw new Error(updateError.message);
      }

      const { error: transactionError } = await context.supabase.from('inventory_transactions').insert({
        inventory_item_id: body.itemId,
        transaction_type: quantity >= 0 ? 'adjust_in' : 'adjust_out',
        quantity,
        resulting_quantity: nextQuantity,
        reason: body.reason?.trim() || null,
        created_by: context.userId,
      });

      if (transactionError) {
        throw new Error(transactionError.message);
      }

      await recordAuditEvent({
        eventType: 'inventory_adjusted',
        entityType: 'inventory_item',
        entityId: body.itemId,
        actorStaffId: context.userId,
        summary: `Adjusted inventory for ${item.item_name}.`,
        detail: body.reason?.trim() || null,
        metadata: { adjustmentQuantity: quantity, resultingQuantity: nextQuantity },
      });

      return NextResponse.json({ success: true });
    }

    if (!body.itemCode || !body.itemName || !body.unit) {
      return NextResponse.json({ error: 'Missing inventory item fields.' }, { status: 400 });
    }

    const { data: created, error: createError } = await context.supabase
      .from('inventory_items')
      .insert({
        item_code: body.itemCode.trim(),
        item_name: body.itemName.trim(),
        unit: body.unit.trim(),
        linked_lane: body.linkedLane?.trim() || null,
        reorder_threshold: Number(body.reorderThreshold ?? 0),
        on_hand_quantity: quantity,
        notes: body.notes?.trim() || null,
        created_by: context.userId,
      })
      .select('id, item_name')
      .single();

    if (createError || !created) {
      throw new Error(createError?.message ?? 'Unable to create inventory item.');
    }

    if (quantity !== 0) {
      const { error: transactionError } = await context.supabase.from('inventory_transactions').insert({
        inventory_item_id: created.id,
        transaction_type: 'initial_stock',
        quantity,
        resulting_quantity: quantity,
        reason: body.reason?.trim() || 'Initial inventory load',
        created_by: context.userId,
      });

      if (transactionError) {
        throw new Error(transactionError.message);
      }
    }

    await recordAuditEvent({
      eventType: 'inventory_created',
      entityType: 'inventory_item',
      entityId: created.id,
      actorStaffId: context.userId,
      summary: `Created inventory item ${created.item_name}.`,
      detail: body.notes?.trim() || null,
      metadata: { initialQuantity: quantity },
    });

    return NextResponse.json({ success: true, itemId: created.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to save inventory.' },
      { status: 500 }
    );
  }
}
