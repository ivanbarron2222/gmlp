'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, ClipboardCheck, Plus, RotateCcw, Save, UserRound } from 'lucide-react';
import { PageLayout } from '@/components/layout/page-layout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { examinationTemplates, getNormalPayload, isAbnormalResult, type ExaminationField } from '@/lib/examination-templates';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

type TestInstance = {
  id: string;
  visit_id: string | null;
  test_type: string;
  sequence_number: number;
  status: string;
  result_payload: Record<string, unknown>;
  notes: string | null;
  updated_at: string;
};

type ProfilePayload = {
  patient: {
    id: string;
    patient_code: string;
    first_name: string;
    middle_name: string | null;
    last_name: string;
    company: string | null;
    birth_date: string;
    gender: string;
    contact_number: string | null;
    email_address: string | null;
    street_address: string | null;
    city: string | null;
    province: string | null;
    profilePhotoUrl: string;
  };
  visits: Array<{ id: string; visit_code: string; service_type: string; status: string; current_lane: string; created_at: string }>;
  testInstances: TestInstance[];
  visibleTestTypes: string[];
  editableTestTypes: string[];
};

async function getAccessToken() {
  const supabase = getSupabaseBrowserClient();
  const { data: { session } } = await supabase!.auth.getSession();
  if (!session?.access_token) throw new Error('Missing authenticated session.');
  return session.access_token;
}

function ResultField({ field, value, disabled, onChange }: {
  field: ExaminationField;
  value: unknown;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const textValue = String(value ?? '');
  const abnormal = isAbnormalResult(field, value);
  const className = abnormal ? 'border-red-400 bg-red-50 focus-visible:ring-red-200' : '';
  const helper = field.normal ?? (field.min !== undefined || field.max !== undefined
    ? `Reference: ${field.min ?? '-'} - ${field.max ?? '-'}${field.unit ? ` ${field.unit}` : ''}`
    : field.normalValue ? `Normal: ${field.normalValue}` : '');

  return (
    <label className="block">
      <span className="flex items-center justify-between gap-2 text-sm font-semibold">
        <span>{field.label}</span>
        {abnormal && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">Review</span>}
      </span>
      <div className="relative mt-2">
        {field.control === 'select' ? (
          <select
            value={textValue}
            onChange={(event) => onChange(event.target.value)}
            disabled={disabled}
            className={`h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`}
          >
            <option value="">Select value</option>
            {field.options?.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        ) : field.control === 'textarea' ? (
          <Textarea value={textValue} onChange={(event) => onChange(event.target.value)} disabled={disabled} className={`min-h-24 ${className}`} />
        ) : (
          <Input
            type={field.control}
            inputMode={field.control === 'number' ? 'decimal' : undefined}
            step={field.step}
            value={textValue}
            onChange={(event) => onChange(event.target.value)}
            disabled={disabled}
            className={`h-11 ${field.unit ? 'pr-24' : ''} ${className}`}
          />
        )}
        {field.unit && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">{field.unit}</span>}
      </div>
      {helper && <span className="mt-1 block text-xs text-muted-foreground">{helper}</span>}
    </label>
  );
}

export default function PatientProfilePage() {
  const params = useParams<{ patientId: string }>();
  const patientId = String(params.patientId);
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [activeType, setActiveType] = useState('');
  const [activeInstanceId, setActiveInstanceId] = useState('');
  const [resultPayload, setResultPayload] = useState<Record<string, unknown>>({});
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);

  const loadProfile = async () => {
    try {
      const token = await getAccessToken();
      const response = await fetch(`/api/staff/patients/${encodeURIComponent(patientId)}`, {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = (await response.json()) as ProfilePayload & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Unable to load patient profile.');
      setProfile(payload);
      setActiveType((current) => current || payload.visibleTestTypes[0] || '');
      setError('');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to load patient profile.');
    }
  };

  useEffect(() => { void loadProfile(); }, [patientId]);

  const instances = useMemo(
    () => profile?.testInstances.filter((instance) => instance.test_type === activeType) ?? [],
    [activeType, profile?.testInstances]
  );
  const activeInstance = instances.find((instance) => instance.id === activeInstanceId) ?? instances[0] ?? null;
  const template = examinationTemplates[activeType];
  const canEdit = profile?.editableTestTypes.includes(activeType) ?? false;
  const groups = useMemo(() => Array.from(new Set(template?.fields.map((field) => field.group) ?? [])), [template]);

  useEffect(() => {
    setActiveInstanceId(activeInstance?.id ?? '');
    setResultPayload(activeInstance?.result_payload ?? {});
    setNotes(activeInstance?.notes ?? '');
    setIsReviewing(false);
    setNotice('');
  }, [activeInstance?.id]);

  const saveInstance = async (options?: { createNew?: boolean; status?: 'draft' | 'completed' }) => {
    try {
      setIsSaving(true);
      setError('');
      setNotice('');
      const token = await getAccessToken();
      const createNew = options?.createNew ?? false;
      const response = await fetch(`/api/staff/patients/${encodeURIComponent(patientId)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(createNew ? {
          testType: activeType,
          visitId: profile?.visits[0]?.id ?? null,
          resultPayload: getNormalPayload(activeType),
        } : {
          id: activeInstance?.id,
          testType: activeType,
          resultPayload,
          notes,
          status: options?.status ?? 'draft',
        }),
      });
      const payload = (await response.json()) as { testInstance?: TestInstance; error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Unable to save examination result.');
      await loadProfile();
      if (payload.testInstance?.id) setActiveInstanceId(payload.testInstance.id);
      setNotice(options?.status === 'completed' ? 'Test marked as completed.' : createNew ? 'New test instance added.' : 'Draft saved.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to save examination result.');
    } finally {
      setIsSaving(false);
    }
  };

  const updateResult = (key: string, value: string) => {
    setResultPayload((current) => ({ ...current, [key]: value }));
  };

  const handleEnterNavigation = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.target instanceof HTMLTextAreaElement) return;
    const target = event.target as HTMLElement;
    if (!target.matches('input, select')) return;
    event.preventDefault();
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('input:not(:disabled), select:not(:disabled), textarea:not(:disabled)'));
    controls[controls.indexOf(target) + 1]?.focus();
  };

  if (!profile) {
    return <PageLayout><div className="px-8 py-8">{error || 'Loading patient profile...'}</div></PageLayout>;
  }

  const patientName = [profile.patient.first_name, profile.patient.middle_name, profile.patient.last_name].filter(Boolean).join(' ');

  return (
    <PageLayout>
      <div className="px-4 py-6 md:px-8 md:py-8">
        <Card className="flex flex-col gap-5 p-6 md:flex-row md:items-center">
          {profile.patient.profilePhotoUrl ? (
            <img src={profile.patient.profilePhotoUrl} alt={patientName} className="h-28 w-28 rounded-2xl object-cover" />
          ) : (
            <div className="flex h-28 w-28 items-center justify-center rounded-2xl bg-muted"><UserRound className="h-12 w-12 text-muted-foreground" /></div>
          )}
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">{profile.patient.patient_code}</p>
            <h1 className="mt-1 text-3xl font-bold">{patientName}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{profile.patient.birth_date} | {profile.patient.gender} | {profile.patient.contact_number || 'No contact number'}</p>
            <p className="mt-1 text-sm text-muted-foreground">{profile.patient.company || 'No company'} | {[profile.patient.street_address, profile.patient.city, profile.patient.province].filter(Boolean).join(', ') || 'No address'}</p>
          </div>
        </Card>

        {error && <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {notice && <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>}

        <Card className="mt-6 p-4 md:p-6">
          <Tabs value={activeType} onValueChange={setActiveType}>
            <TabsList className="flex h-auto flex-wrap justify-start">
              {profile.visibleTestTypes.map((testType) => <TabsTrigger key={testType} value={testType}>{examinationTemplates[testType]?.label ?? testType}</TabsTrigger>)}
            </TabsList>
            {profile.visibleTestTypes.map((testType) => (
              <TabsContent key={testType} value={testType} className="mt-6">
                <div className="flex flex-wrap items-center gap-2 border-b pb-4">
                  {instances.map((instance) => (
                    <Button key={instance.id} type="button" size="sm" variant={activeInstance?.id === instance.id ? 'default' : 'outline'} onClick={() => setActiveInstanceId(instance.id)}>
                      Test {instance.sequence_number}
                    </Button>
                  ))}
                  {canEdit && <Button type="button" size="sm" variant="outline" onClick={() => void saveInstance({ createNew: true })} disabled={isSaving}><Plus className="mr-1 h-4 w-4" /> Add Test</Button>}
                </div>

                {activeInstance && template ? (
                  <div className="mt-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h2 className="text-xl font-bold">{template.label} - Test {activeInstance.sequence_number}</h2>
                        <p className="mt-1 text-sm text-muted-foreground">Template v{template.version}. Press Enter to move to the next field.</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => setIsReviewing((current) => !current)}>
                          <ClipboardCheck className="mr-2 h-4 w-4" /> {isReviewing ? 'Back to Encoding' : 'Review All'}
                        </Button>
                        {canEdit && <Button type="button" variant="outline" size="sm" onClick={() => setResultPayload(getNormalPayload(activeType))}>
                          <RotateCcw className="mr-2 h-4 w-4" /> Reset to Normal
                        </Button>}
                      </div>
                    </div>

                    {isReviewing ? (
                      <div className="mt-6 overflow-x-auto rounded-xl border">
                        <table className="w-full min-w-[680px] text-left text-sm">
                          <thead className="bg-muted/50"><tr><th className="px-4 py-3">Section</th><th className="px-4 py-3">Test</th><th className="px-4 py-3">Reference</th><th className="px-4 py-3">Result</th><th className="px-4 py-3">Status</th></tr></thead>
                          <tbody>
                            {template.fields.map((field) => {
                              const value = resultPayload[field.key];
                              const abnormal = isAbnormalResult(field, value);
                              return <tr key={field.key} className="border-t"><td className="px-4 py-3 text-muted-foreground">{field.group}</td><td className="px-4 py-3 font-medium">{field.label}</td><td className="px-4 py-3">{field.normal ?? field.normalValue ?? (field.min !== undefined || field.max !== undefined ? `${field.min ?? '-'} - ${field.max ?? '-'}` : '-')}</td><td className="px-4 py-3 font-mono">{String(value ?? '-')} {field.unit ?? ''}</td><td className={`px-4 py-3 font-semibold ${abnormal ? 'text-red-700' : 'text-emerald-700'}`}>{abnormal ? 'Review' : 'Normal'}</td></tr>;
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="mt-6 space-y-6" onKeyDown={handleEnterNavigation}>
                        {groups.map((group) => (
                          <section key={group} className="rounded-xl border bg-muted/10 p-4">
                            <h3 className="text-base font-bold">{group}</h3>
                            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                              {template.fields.filter((field) => field.group === group).map((field) => (
                                <ResultField key={field.key} field={field} value={resultPayload[field.key]} disabled={!canEdit} onChange={(value) => updateResult(field.key, value)} />
                              ))}
                            </div>
                          </section>
                        ))}
                      </div>
                    )}

                    <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_auto]">
                      <div>
                        <p className="mb-2 text-sm font-semibold">Notes</p>
                        <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} disabled={!canEdit} className="min-h-24" placeholder="Optional staff notes" />
                        <p className="mt-2 text-xs text-muted-foreground">Current status: {activeInstance.status}</p>
                      </div>
                      {canEdit && <div className="flex flex-wrap items-end gap-2">
                        <Button variant="outline" onClick={() => void saveInstance()} disabled={isSaving}><Save className="mr-2 h-4 w-4" />{isSaving ? 'Saving...' : 'Save Draft'}</Button>
                        <Button onClick={() => void saveInstance({ status: 'completed' })} disabled={isSaving}><CheckCircle2 className="mr-2 h-4 w-4" /> Complete Test</Button>
                      </div>}
                    </div>
                  </div>
                ) : (
                  <div className="mt-5 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                    No {examinationTemplates[testType]?.label ?? testType} results yet.{canEdit ? ' Add Test to start encoding.' : ''}
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </Card>
      </div>
    </PageLayout>
  );
}
