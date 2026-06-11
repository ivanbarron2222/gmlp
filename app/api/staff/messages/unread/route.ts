import { NextResponse } from 'next/server';
import { requireStaffContext } from '@/lib/supabase/admin-auth';

type StaffMessageChannel = {
  id: string;
  channel_code: string;
};

function isVisibleChannel(channel: StaffMessageChannel, staffId: string) {
  return !channel.channel_code.startsWith('direct:') || channel.channel_code.split(':').includes(staffId);
}

export async function GET(request: Request) {
  try {
    const { supabase, userId } = await requireStaffContext(request);

    const { data: channels, error: channelsError } = await supabase
      .from('staff_message_channels')
      .select('id, channel_code')
      .eq('is_active', true);

    if (channelsError) {
      throw new Error(channelsError.message);
    }

    const visibleChannels = ((channels ?? []) as StaffMessageChannel[]).filter((channel) =>
      isVisibleChannel(channel, userId)
    );

    const { data: reads } = await supabase
      .from('staff_message_reads')
      .select('channel_id, last_read_at')
      .eq('staff_id', userId);

    const lastReadByChannel = new Map(
      (reads ?? []).map((read) => [String(read.channel_id), String(read.last_read_at)])
    );

    const unreadCounts = await Promise.all(
      visibleChannels.map(async (channel) => {
        let query = supabase
          .from('staff_messages')
          .select('id', { count: 'exact', head: true })
          .eq('channel_id', channel.id)
          .neq('sender_id', userId);

        const lastReadAt = lastReadByChannel.get(channel.id);
        if (lastReadAt) {
          query = query.gt('created_at', lastReadAt);
        }

        const { count } = await query;
        return count ?? 0;
      })
    );

    const totalUnreadCount = unreadCounts.reduce((sum, count) => sum + count, 0);

    return NextResponse.json({ totalUnreadCount });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load unread message count.' },
      { status: 500 }
    );
  }
}
