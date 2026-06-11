import { NextResponse } from 'next/server';
import { requireStaffContext } from '@/lib/supabase/admin-auth';

function buildDirectChannelCode(leftStaffId: string, rightStaffId: string) {
  return `direct:${[leftStaffId, rightStaffId].sort().join(':')}`;
}

export async function POST(request: Request) {
  try {
    const { supabase, userId, fullName } = await requireStaffContext(request);
    const body = (await request.json()) as { recipientId?: string };
    const recipientId = String(body.recipientId ?? '');

    if (!recipientId || recipientId === userId) {
      return NextResponse.json({ error: 'Select another active staff member.' }, { status: 400 });
    }

    const { data: recipient, error: recipientError } = await supabase
      .from('staff_profiles')
      .select('id, full_name, is_active')
      .eq('id', recipientId)
      .eq('is_active', true)
      .single();

    if (recipientError || !recipient) {
      return NextResponse.json({ error: 'Recipient staff account was not found.' }, { status: 404 });
    }

    const channelCode = buildDirectChannelCode(userId, recipientId);
    const channelName = `Direct: ${fullName || 'Staff'} / ${recipient.full_name || 'Staff'}`;

    const { data: channel, error: channelError } = await supabase
      .from('staff_message_channels')
      .upsert(
        {
          channel_code: channelCode,
          name: channelName,
          description: 'Direct staff message. Online-only.',
          is_active: true,
          created_by: userId,
        },
        { onConflict: 'channel_code' }
      )
      .select('id, channel_code, name, description')
      .single();

    if (channelError || !channel) {
      throw new Error(channelError?.message ?? 'Unable to open direct message.');
    }

    return NextResponse.json({ channel });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to open direct message.' },
      { status: 500 }
    );
  }
}
