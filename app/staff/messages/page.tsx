'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Send, Search, UserRound, Wifi, WifiOff } from 'lucide-react';
import { PageLayout } from '@/components/layout/page-layout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { readStaffProfile } from '@/lib/station-role';

type Channel = {
  id: string;
  channel_code: string;
  name: string;
  description: string | null;
  unreadCount?: number;
};

type StaffMessage = {
  id: string;
  channel_id: string;
  sender_id: string | null;
  body: string;
  created_at: string;
  staff_profiles?: { full_name?: string | null; role?: string | null } | null;
};

type StaffSearchResult = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  departments?: { name?: string | null } | null;
  job_positions?: { name?: string | null } | null;
};

async function getAccessToken() {
  const supabase = getSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase!.auth.getSession();
  if (!session?.access_token) throw new Error('Missing authenticated session.');
  return session.access_token;
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? 'S') + (parts[parts.length - 1]?.[0] ?? '');
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function cleanChannelName(channel: Channel | null) {
  if (!channel) return 'Messages';
  if (!channel.channel_code.startsWith('direct:')) return channel.name;
  return channel.name.replace(/^Direct:\s*/i, '');
}

export default function MessagesPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState('');
  const [messages, setMessages] = useState<StaffMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [staffQuery, setStaffQuery] = useState('');
  const [staffResults, setStaffResults] = useState<StaffSearchResult[]>([]);
  const [pageError, setPageError] = useState('');
  const [isOnline, setIsOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [currentStaffId, setCurrentStaffId] = useState('');

  const selectedChannel = useMemo(
    () => channels.find((channel) => channel.id === selectedChannelId) ?? null,
    [channels, selectedChannelId]
  );

  const loadMessages = async (channelId?: string) => {
    try {
      setPageError('');
      const token = await getAccessToken();
      const params = new URLSearchParams();
      if (channelId || selectedChannelId) params.set('channelId', channelId || selectedChannelId);
      const response = await fetch(`/api/staff/messages${params.toString() ? `?${params.toString()}` : ''}`, {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = (await response.json()) as {
        channels?: Channel[];
        selectedChannelId?: string;
        messages?: StaffMessage[];
        totalUnreadCount?: number;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? 'Unable to load messages.');
      setChannels(payload.channels ?? []);
      setSelectedChannelId(payload.selectedChannelId ?? '');
      setMessages(payload.messages ?? []);
      window.dispatchEvent(
        new CustomEvent('staff-messages-unread', {
          detail: { totalUnreadCount: payload.totalUnreadCount ?? 0 },
        })
      );
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Unable to load messages.');
    }
  };

  const searchStaff = async () => {
    try {
      setPageError('');
      const token = await getAccessToken();
      const params = new URLSearchParams();
      if (staffQuery.trim()) params.set('query', staffQuery.trim());
      const response = await fetch(`/api/staff/messages/staff-search?${params.toString()}`, {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = (await response.json()) as { staff?: StaffSearchResult[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Unable to search staff.');
      setStaffResults(payload.staff ?? []);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Unable to search staff.');
    }
  };

  const openDirectMessage = async (recipientId: string) => {
    if (!isOnline) {
      setPageError('Direct messaging is online-only. Connect to the internet first.');
      return;
    }

    try {
      setPageError('');
      const token = await getAccessToken();
      const response = await fetch('/api/staff/messages/direct', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ recipientId }),
      });
      const payload = (await response.json()) as { channel?: Channel; error?: string };
      if (!response.ok || !payload.channel) throw new Error(payload.error ?? 'Unable to open direct message.');
      await loadMessages(payload.channel.id);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Unable to open direct message.');
    }
  };

  useEffect(() => {
    setCurrentStaffId(readStaffProfile()?.id ?? '');
    void loadMessages();
    void searchStaff();
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!selectedChannelId || !isOnline) return;
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      ?.channel(`staff_messages:${selectedChannelId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'staff_messages',
          filter: `channel_id=eq.${selectedChannelId}`,
        },
        () => {
          void loadMessages(selectedChannelId);
        }
      )
      .subscribe();

    return () => {
      if (channel) void supabase?.removeChannel(channel);
    };
  }, [isOnline, selectedChannelId]);

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedChannelId || !draft.trim()) return;
    if (!isOnline) {
      setPageError('Messaging is online-only. Connect to the internet to send messages.');
      return;
    }

    try {
      setPageError('');
      const token = await getAccessToken();
      const response = await fetch('/api/staff/messages', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ channelId: selectedChannelId, body: draft }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Unable to send message.');
      setDraft('');
      await loadMessages(selectedChannelId);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Unable to send message.');
    }
  };

  return (
    <PageLayout>
      <div className="px-4 py-4 md:px-8">
        {pageError && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {pageError}
          </div>
        )}

        <Card className="grid h-[calc(100dvh-7rem)] min-h-[34rem] overflow-hidden p-0 shadow-sm xl:grid-cols-[22rem_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col border-b bg-background xl:border-b-0 xl:border-r">
            <div className="border-b px-4 py-4">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={staffQuery}
                    onChange={(event) => setStaffQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void searchStaff();
                    }}
                    className="pl-9"
                    placeholder="Name or email"
                  />
                </div>
                <Button type="button" variant="outline" className="h-10 px-3" onClick={() => void searchStaff()}>
                  Search
                </Button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="border-b px-4 py-3">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">People</p>
                {staffResults.map((staff) => {
                  const department = Array.isArray(staff.departments) ? staff.departments[0] : staff.departments;
                  const position = Array.isArray(staff.job_positions) ? staff.job_positions[0] : staff.job_positions;
                  return (
                    <button
                      key={staff.id}
                      type="button"
                      onClick={() => void openDirectMessage(staff.id)}
                      className="w-full rounded-2xl px-3 py-3 text-left text-sm transition hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-black text-primary-foreground">
                          {getInitials(staff.full_name)}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{staff.full_name}</p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {position?.name ?? staff.role} {department?.name ? `| ${department.name}` : ''}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
                {!staffResults.length && (
                  <p className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
                    No staff found.
                  </p>
                )}
              </div>

              <div className="px-4 py-3">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Conversations</p>
              {channels.map((channel) => (
                <button
                  key={channel.id}
                  type="button"
                  onClick={() => {
                    setSelectedChannelId(channel.id);
                    void loadMessages(channel.id);
                  }}
                  className={`w-full rounded-2xl px-3 py-3 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    selectedChannelId === channel.id ? 'bg-primary/10' : 'hover:bg-muted/70'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={channel.channel_code.startsWith('direct:') ? 'flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-600 text-sm font-black text-white' : 'flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-black text-muted-foreground'}>
                      {getInitials(cleanChannelName(channel))}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{cleanChannelName(channel)}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{channel.description}</p>
                    </div>
                    {(channel.unreadCount ?? 0) > 0 && (
                      <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-primary px-2 text-xs font-black leading-none text-primary-foreground">
                        {(channel.unreadCount ?? 0) > 99 ? '99+' : channel.unreadCount}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
            </div>
          </aside>

          <section className="flex min-h-0 min-w-0 flex-col bg-slate-50">
            <div className="border-b bg-background/95 px-4 py-3 backdrop-blur md:px-6">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-black text-primary-foreground">
                    {getInitials(cleanChannelName(selectedChannel))}
                  </div>
                  <div className="min-w-0">
                  <h2 className="truncate text-lg font-bold">{cleanChannelName(selectedChannel)}</h2>
                  <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                    {isOnline ? <Wifi className="h-3.5 w-3.5 text-emerald-600" /> : <WifiOff className="h-3.5 w-3.5 text-red-600" />}
                    <span>{isOnline ? 'Online' : 'Offline'}</span>
                    <span className="hidden sm:inline">|</span>
                    <span className="hidden truncate sm:inline">{selectedChannel?.description ?? 'Select a channel.'}</span>
                  </div>
                  </div>
                </div>
                <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">
                  {messages.length} messages
                </span>
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 md:p-6">
              {messages.map((message) => {
                const isOwn = message.sender_id === currentStaffId;
                const senderName = message.staff_profiles?.full_name ?? 'Staff';
                return (
                  <div key={message.id} className={`flex gap-2 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                    {!isOwn && (
                      <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-black text-muted-foreground">
                        {getInitials(senderName)}
                      </div>
                    )}
                    <div className={`max-w-[82%] md:max-w-[68%] ${isOwn ? 'items-end' : 'items-start'}`}>
                      {!isOwn && <p className="mb-1 px-1 text-xs font-semibold text-muted-foreground">{senderName}</p>}
                      <div className={isOwn ? 'rounded-[1.35rem] rounded-br-md bg-primary px-4 py-2.5 text-primary-foreground shadow-sm' : 'rounded-[1.35rem] rounded-bl-md bg-background px-4 py-2.5 text-foreground shadow-sm'}>
                        <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.body}</p>
                      </div>
                      <p className={`mt-1 px-1 text-[11px] text-muted-foreground ${isOwn ? 'text-right' : 'text-left'}`}>
                        {formatTime(message.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })}
              {!messages.length && (
                <div className="flex h-full items-center justify-center">
                  <div className="max-w-sm rounded-3xl border border-dashed bg-background p-8 text-center text-sm text-muted-foreground">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <UserRound className="h-5 w-5" />
                    </div>
                    No messages yet. Start the conversation when you are online.
                  </div>
                </div>
              )}
            </div>
            <form className="border-t bg-background p-3 md:p-4" onSubmit={sendMessage}>
              <label className="sr-only" htmlFor="message_draft">Message</label>
              <div className="relative">
                <Textarea
                  id="message_draft"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      if (isOnline && selectedChannelId && draft.trim()) {
                        event.currentTarget.form?.requestSubmit();
                      }
                    }
                  }}
                  placeholder={isOnline ? 'Type a message...' : 'Messaging is unavailable offline.'}
                  disabled={!isOnline || !selectedChannelId}
                  className="min-h-12 resize-none rounded-3xl border-muted bg-muted/60 py-3 pl-5 pr-14"
                />
                <Button
                  type="submit"
                  size="icon"
                  aria-label="Send message"
                  className="absolute bottom-2 right-2 h-9 w-9 rounded-full"
                  disabled={!isOnline || !selectedChannelId || !draft.trim()}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </form>
          </section>
        </Card>
      </div>
    </PageLayout>
  );
}
