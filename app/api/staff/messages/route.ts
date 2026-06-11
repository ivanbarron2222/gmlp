import { NextResponse } from 'next/server';
import { requireStaffContext } from '@/lib/supabase/admin-auth';

type StaffMessageChannel = {
  id: string;
  channel_code: string;
  name: string;
  description: string | null;
};

function isVisibleChannel(channel: StaffMessageChannel, staffId: string) {
  return !channel.channel_code.startsWith('direct:') || channel.channel_code.split(':').includes(staffId);
}

async function getUnreadCounts(
  supabase: Awaited<ReturnType<typeof requireStaffContext>>['supabase'],
  staffId: string,
  channels: StaffMessageChannel[]
) {
  const { data: reads } = await supabase
    .from('staff_message_reads')
    .select('channel_id, last_read_at')
    .eq('staff_id', staffId);

  const lastReadByChannel = new Map(
    (reads ?? []).map((read) => [String(read.channel_id), String(read.last_read_at)])
  );
  const entries = await Promise.all(
    channels.map(async (channel) => {
      let query = supabase
        .from('staff_messages')
        .select('id', { count: 'exact', head: true })
        .eq('channel_id', channel.id)
        .neq('sender_id', staffId);

      const lastReadAt = lastReadByChannel.get(channel.id);
      if (lastReadAt) {
        query = query.gt('created_at', lastReadAt);
      }

      const { count } = await query;
      return [channel.id, count ?? 0] as const;
    })
  );

  return new Map(entries);
}

export async function GET(request: Request) {
  try {
    const { supabase, userId } = await requireStaffContext(request);
    const url = new URL(request.url);
    const channelId = url.searchParams.get('channelId');

    const { data: channels, error: channelsError } = await supabase
      .from('staff_message_channels')
      .select('id, channel_code, name, description')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (channelsError) {
      throw new Error(channelsError.message);
    }

    const visibleChannels = ((channels ?? []) as StaffMessageChannel[]).filter((channel) =>
      isVisibleChannel(channel, userId)
    );
    const requestedChannel = visibleChannels.find((channel) => channel.id === channelId);
    const selectedChannelId = requestedChannel?.id || visibleChannels[0]?.id || '';
    let messages: unknown[] = [];

    if (selectedChannelId) {
      await supabase
        .from('staff_message_reads')
        .upsert(
          {
            staff_id: userId,
            channel_id: selectedChannelId,
            last_read_at: new Date().toISOString(),
          },
          { onConflict: 'staff_id,channel_id' }
        );

      const { data, error } = await supabase
        .from('staff_messages')
        .select('id, channel_id, sender_id, body, related_patient_id, related_visit_id, created_at, staff_profiles:sender_id(full_name, role)')
        .eq('channel_id', selectedChannelId)
        .order('created_at', { ascending: true })
        .limit(100);

      if (error) {
        throw new Error(error.message);
      }

      messages = data ?? [];
    }

    const unreadCounts = await getUnreadCounts(supabase, userId, visibleChannels);
    const channelsWithUnread = visibleChannels.map((channel) => ({
      ...channel,
      unreadCount: unreadCounts.get(channel.id) ?? 0,
    }));
    const totalUnreadCount = Array.from(unreadCounts.values()).reduce((sum, count) => sum + count, 0);

    return NextResponse.json({ channels: channelsWithUnread, selectedChannelId, messages, totalUnreadCount });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load staff messages.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, userId } = await requireStaffContext(request);
    const body = (await request.json()) as {
      channelId?: string;
      body?: string;
      relatedPatientId?: string | null;
      relatedVisitId?: string | null;
    };

    if (!body.channelId || !body.body?.trim()) {
      return NextResponse.json({ error: 'Channel and message are required.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('staff_messages')
      .insert({
        channel_id: body.channelId,
        sender_id: userId,
        body: body.body.trim(),
        related_patient_id: body.relatedPatientId ?? null,
        related_visit_id: body.relatedVisitId ?? null,
      })
      .select('id, channel_id, sender_id, body, related_patient_id, related_visit_id, created_at')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ message: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to send staff message.' },
      { status: 500 }
    );
  }
}
