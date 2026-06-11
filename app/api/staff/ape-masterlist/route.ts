import { NextResponse } from 'next/server';
import { requireStaffContext } from '@/lib/supabase/admin-auth';

export async function GET(request: Request) {
  try {
    const { supabase } = await requireStaffContext(request);
    const url = new URL(request.url);
    const apeEventId = url.searchParams.get('apeEventId');
    const companyName = url.searchParams.get('companyName');
    const query = url.searchParams.get('query')?.trim() ?? '';

    if (!apeEventId || !companyName) {
      return NextResponse.json({ patients: [], availableLabOrders: [] });
    }

    let patientsQuery = supabase
      .from('ape_masterlist_patients')
      .select(
        'id, first_name, middle_name, last_name, birth_date, age, gender, department, contact_number, email_address, assigned_patient_id, assigned_lab_order_id, assigned_at'
      )
      .eq('ape_event_id', apeEventId)
      .eq('company_name', companyName)
      .order('last_name', { ascending: true })
      .limit(25);

    if (query) {
      patientsQuery = patientsQuery.or(
        `first_name.ilike.%${query}%,middle_name.ilike.%${query}%,last_name.ilike.%${query}%,department.ilike.%${query}%`
      );
    }

    const [{ data: patients, error: patientsError }, { data: orders, error: ordersError }] = await Promise.all([
      patientsQuery,
      supabase
        .from('ape_lab_order_pool')
        .select('id, lab_order_number, sequence_number')
        .eq('ape_event_id', apeEventId)
        .eq('company_name', companyName)
        .eq('status', 'available')
        .order('sequence_number', { ascending: true })
        .limit(250),
    ]);

    if (patientsError) {
      throw new Error(patientsError.message);
    }
    if (ordersError) {
      throw new Error(ordersError.message);
    }

    const assignedOrderIds = (patients ?? [])
      .map((patient) => patient.assigned_lab_order_id)
      .filter(Boolean) as string[];
    let assignedLabOrderById = new Map<string, { lab_order_number: string }>();

    if (assignedOrderIds.length > 0) {
      const { data: assignedOrders, error: assignedOrdersError } = await supabase
        .from('ape_lab_order_pool')
        .select('id, lab_order_number')
        .in('id', assignedOrderIds);

      if (assignedOrdersError) {
        throw new Error(assignedOrdersError.message);
      }

      assignedLabOrderById = new Map(
        (assignedOrders ?? []).map((order) => [String(order.id), { lab_order_number: String(order.lab_order_number) }])
      );
    }

    return NextResponse.json({
      patients: (patients ?? []).map((patient) => ({
        ...patient,
        ape_lab_order_pool: patient.assigned_lab_order_id
          ? assignedLabOrderById.get(String(patient.assigned_lab_order_id)) ?? null
          : null,
      })),
      availableLabOrders: orders ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load APE masterlist.' },
      { status: 500 }
    );
  }
}
