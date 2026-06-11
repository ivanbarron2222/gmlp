'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Building2,
  CheckCircle2,
  CloudUpload,
  DollarSign,
  MapPin,
  Pencil,
  PlayCircle,
  ShieldPlus,
  Stethoscope,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import { actionPermissionCatalog, getDefaultActionPermissions, type ActionPermission } from '@/lib/action-permissions';
import { PageLayout } from '@/components/layout/page-layout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { readStationRole } from '@/lib/station-role';
import { formatCurrency } from '@/lib/formatting';
import { getDefaultAllowedModules, moduleCatalog, type StaffModulePath } from '@/lib/staff-modules';
import { mapDbRoleToStationRole } from '@/lib/station-role';
import {
  departmentCatalog,
  getDepartmentLabel,
  getJobPositionLabel,
  getLegacyRoleForAccount,
  jobPositionCatalog,
  type DepartmentCode,
  type JobPositionCode,
} from '@/lib/staff-account';

type ServiceCatalogRow = {
  id: string;
  service_code: string;
  service_name: string;
  category: string;
  amount: number;
  is_active: boolean;
  sort_order: number;
  service_lane?: string | null;
  updated_at?: string;
};

type PartnerCompanyRow = {
  id: string;
  company_code: string;
  company_name: string;
  contact_person?: string | null;
  contact_number?: string | null;
  email_address?: string | null;
  notes?: string | null;
  is_active: boolean;
  preEmploymentAmount?: number;
  checkUpAmount?: number;
  labAmount?: number;
  preEmploymentServiceCodes?: string[];
  labServiceCodes?: string[];
  updated_at?: string;
};

type StaffProfileRow = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  assigned_lane?: string | null;
  is_active: boolean;
  allowed_modules?: StaffModulePath[];
  action_permissions?: ActionPermission[];
  departments?: { code: DepartmentCode; name: string } | null;
  job_positions?: { code: JobPositionCode; name: string } | null;
  updated_at?: string;
};

type DoctorRow = {
  id: string;
  full_name: string;
  is_active: boolean;
  updated_at?: string;
};

type ApeEventRow = {
  id: string;
  ape_code: string;
  name: string;
  location?: string | null;
  start_date: string;
  end_date?: string | null;
  status: 'planned' | 'active' | 'completed' | 'cancelled';
  created_at?: string;
  updated_at?: string;
};

type ApeRuntime = {
  apeModeEnabled: boolean;
  activeApeEventId: string | null;
  activeApeEvent: {
    id: string;
    apeCode: string;
    name: string;
    location: string;
    status: string;
  } | null;
  syncSummary: {
    pendingCount: number;
    conflictCount: number;
    failedCount: number;
    status: string;
  };
};

const initialServiceForm = {
  service_code: '',
  service_name: '',
  category: '',
  amount: '0',
  sort_order: '1',
  service_lane: '',
};

const initialCompanyForm = {
  company_code: '',
  company_name: '',
  contact_person: '',
  contact_number: '',
  email_address: '',
  notes: '',
  pre_employment_amount: '0',
  check_up_amount: '0',
  lab_amount: '0',
  pre_employment_service_codes: [] as string[],
  lab_service_codes: [] as string[],
};

const initialStaffForm = {
  email: '',
  password: '',
  full_name: '',
  department_code: 'clinical_exam' as DepartmentCode,
  job_position_code: 'nurse' as JobPositionCode,
};

const initialDoctorForm = {
  full_name: '',
};

const initialApeEventForm = {
  ape_code: '',
  name: '',
  location: '',
  start_date: new Date().toISOString().slice(0, 10),
  end_date: '',
};

const initialMasterlistForm = {
  apeEventId: '',
  companyName: '',
};

const initialStaffEditForm = {
  full_name: '',
  role: 'nurse',
  department_code: 'clinical_exam' as DepartmentCode,
  job_position_code: 'nurse' as JobPositionCode,
  is_active: true,
  allowed_modules: [] as StaffModulePath[],
  action_permissions: [] as ActionPermission[],
};

const initialDoctorEditForm = {
  full_name: '',
  is_active: true,
};

async function getAdminAccessToken() {
  const supabase = getSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase!.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Missing authenticated session.');
  }

  return session.access_token;
}

function AdminMetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: typeof Activity;
  tone?: 'default' | 'success' | 'warning';
}) {
  const toneClass =
    tone === 'success'
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-100'
      : tone === 'warning'
        ? 'bg-amber-50 text-amber-700 ring-amber-100'
        : 'bg-primary/10 text-primary ring-primary/10';

  return (
    <Card className="group overflow-hidden border-border/70 bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-2 text-3xl font-black leading-none tracking-tight">{value}</p>
          <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
        </div>
        <div className={`rounded-2xl p-3 ring-1 ${toneClass}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

function SyncStatusCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'default' | 'warning' | 'danger';
}) {
  const toneClass =
    tone === 'danger'
      ? 'border-red-100 bg-red-50 text-red-700'
      : tone === 'warning'
        ? 'border-amber-100 bg-amber-50 text-amber-700'
        : 'border-border bg-muted/40 text-foreground';

  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-2 text-3xl font-black leading-none">{value}</p>
    </div>
  );
}

export default function AdminSettingsPage() {
  const [stationRole, setStationRole] = useState<string | null>(null);
  const [services, setServices] = useState<ServiceCatalogRow[]>([]);
  const [companies, setCompanies] = useState<PartnerCompanyRow[]>([]);
  const [doctors, setDoctors] = useState<DoctorRow[]>([]);
  const [staff, setStaff] = useState<StaffProfileRow[]>([]);
  const [apeEvents, setApeEvents] = useState<ApeEventRow[]>([]);
  const [apeRuntime, setApeRuntime] = useState<ApeRuntime>({
    apeModeEnabled: false,
    activeApeEventId: null,
    activeApeEvent: null,
    syncSummary: {
      pendingCount: 0,
      conflictCount: 0,
      failedCount: 0,
      status: 'not_configured',
    },
  });
  const [pageError, setPageError] = useState('');
  const [pageNotice, setPageNotice] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [serviceForm, setServiceForm] = useState(initialServiceForm);
  const [companyForm, setCompanyForm] = useState(initialCompanyForm);
  const [staffForm, setStaffForm] = useState(initialStaffForm);
  const [doctorForm, setDoctorForm] = useState(initialDoctorForm);
  const [apeEventForm, setApeEventForm] = useState(initialApeEventForm);
  const [masterlistForm, setMasterlistForm] = useState(initialMasterlistForm);
  const [masterlistFile, setMasterlistFile] = useState<File | null>(null);
  const [staffFilter, setStaffFilter] = useState<'all' | 'pending' | 'active'>('all');
  const [isStaffCreateOpen, setIsStaffCreateOpen] = useState(false);
  const [editingService, setEditingService] = useState<ServiceCatalogRow | null>(null);
  const [editingCompany, setEditingCompany] = useState<PartnerCompanyRow | null>(null);
  const [editingStaff, setEditingStaff] = useState<StaffProfileRow | null>(null);
  const [editingDoctor, setEditingDoctor] = useState<DoctorRow | null>(null);
  const [serviceEditForm, setServiceEditForm] = useState(initialServiceForm);
  const [companyEditForm, setCompanyEditForm] = useState(initialCompanyForm);
  const [staffEditForm, setStaffEditForm] = useState(initialStaffEditForm);
  const [doctorEditForm, setDoctorEditForm] = useState(initialDoctorEditForm);

  const isAdmin = stationRole === 'admin';

  useEffect(() => {
    setStationRole(readStationRole());
  }, []);

  const activeServices = useMemo(() => services.filter((service) => service.is_active), [services]);
  const activeLabServices = useMemo(
    () =>
      activeServices.filter((service) => {
        const category = service.category.toLowerCase();
        return Boolean(service.service_lane) || category.includes('laboratory') || category.includes('imaging');
      }),
    [activeServices]
  );
  const activeCompanies = useMemo(() => companies.filter((company) => company.is_active), [companies]);
  const activeStaff = useMemo(() => staff.filter((member) => member.is_active), [staff]);
  const activeDoctors = useMemo(() => doctors.filter((doctor) => doctor.is_active), [doctors]);
  const pendingStaff = useMemo(() => staff.filter((member) => !member.is_active), [staff]);
  const filteredStaff = useMemo(() => {
    if (staffFilter === 'pending') {
      return pendingStaff;
    }

    if (staffFilter === 'active') {
      return activeStaff;
    }

    return staff;
  }, [activeStaff, pendingStaff, staff, staffFilter]);

  const loadSettings = async () => {
    setIsLoading(true);
    setPageError('');

    try {
      const token = await getAdminAccessToken();
      const response = await fetch('/api/staff/admin/settings', {
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const payload = (await response.json()) as {
        error?: string;
        services?: ServiceCatalogRow[];
        companies?: PartnerCompanyRow[];
        doctors?: DoctorRow[];
        staff?: StaffProfileRow[];
        healthSummary?: {
          lowInventoryCount?: number;
          undeliveredNotificationCount?: number;
          exceptionEventCount?: number;
          overdueAppointmentCount?: number;
        };
        apeEvents?: ApeEventRow[];
        apeRuntime?: ApeRuntime;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to load admin settings.');
      }

      setServices(payload.services ?? []);
      setCompanies(payload.companies ?? []);
      setDoctors(payload.doctors ?? []);
      setStaff(payload.staff ?? []);
      setApeEvents(payload.apeEvents ?? []);
      if (payload.apeRuntime) {
        setApeRuntime(payload.apeRuntime);
      }
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Unable to load admin settings.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (stationRole === 'admin') {
      void loadSettings();
    } else if (stationRole) {
      setIsLoading(false);
    }
  }, [stationRole]);

  const submitAdminAction = async (payload: object, successMessage: string) => {
    setIsSaving(true);
    setPageError('');
    setPageNotice('');

    try {
      const token = await getAdminAccessToken();
      const response = await fetch('/api/staff/admin/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(result?.error ?? 'Unable to save admin settings.');
      }

      setPageNotice(successMessage);
      await loadSettings();
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Unable to save admin settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleServiceSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitAdminAction(
      {
        kind: 'service',
        service: {
          ...serviceForm,
          amount: Number(serviceForm.amount),
          sort_order: Number(serviceForm.sort_order),
          service_lane: serviceForm.service_lane || null,
          is_active: true,
        },
      },
      'Service pricing has been saved.'
    );
    setServiceForm(initialServiceForm);
  };

  const handleCompanySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitAdminAction(
      {
        kind: 'company',
        company: {
          ...companyForm,
          pre_employment_amount: Number(companyForm.pre_employment_amount),
          check_up_amount: Number(companyForm.check_up_amount),
          lab_amount: Number(companyForm.lab_amount),
          pre_employment_service_codes: companyForm.pre_employment_service_codes,
          lab_service_codes: companyForm.lab_service_codes,
          is_active: true,
        },
      },
      'Partner company has been saved.'
    );
    setCompanyForm(initialCompanyForm);
  };

  const openServiceEdit = (service: ServiceCatalogRow) => {
    setEditingService(service);
    setServiceEditForm({
      service_code: service.service_code,
      service_name: service.service_name,
      category: service.category,
      amount: String(service.amount),
      sort_order: String(service.sort_order),
      service_lane: service.service_lane ?? '',
    });
  };

  const openCompanyEdit = (company: PartnerCompanyRow) => {
    setEditingCompany(company);
    setCompanyEditForm({
      company_code: company.company_code,
      company_name: company.company_name,
      contact_person: company.contact_person ?? '',
      contact_number: company.contact_number ?? '',
      email_address: company.email_address ?? '',
      notes: company.notes ?? '',
      pre_employment_amount: String(company.preEmploymentAmount ?? 0),
      check_up_amount: String(company.checkUpAmount ?? 0),
      lab_amount: String(company.labAmount ?? 0),
      pre_employment_service_codes: company.preEmploymentServiceCodes ?? [],
      lab_service_codes: company.labServiceCodes ?? [],
    });
  };

  const handleServiceEditSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingService) {
      return;
    }

    await submitAdminAction(
      {
        kind: 'service',
        service: {
          id: editingService.id,
          ...serviceEditForm,
          amount: Number(serviceEditForm.amount),
          sort_order: Number(serviceEditForm.sort_order),
          service_lane: serviceEditForm.service_lane || null,
          is_active: editingService.is_active,
        },
      },
      'Service pricing has been updated.'
    );

    setEditingService(null);
    setServiceEditForm(initialServiceForm);
  };

  const handleCompanyEditSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingCompany) {
      return;
    }

    await submitAdminAction(
      {
        kind: 'company',
        company: {
          id: editingCompany.id,
          ...companyEditForm,
          pre_employment_amount: Number(companyEditForm.pre_employment_amount),
          check_up_amount: Number(companyEditForm.check_up_amount),
          lab_amount: Number(companyEditForm.lab_amount),
          pre_employment_service_codes: companyEditForm.pre_employment_service_codes,
          lab_service_codes: companyEditForm.lab_service_codes,
          is_active: editingCompany.is_active,
        },
      },
      'Partner company has been updated.'
    );

    setEditingCompany(null);
    setCompanyEditForm(initialCompanyForm);
  };

  const handleStaffSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const accountRole = getLegacyRoleForAccount(staffForm.department_code, staffForm.job_position_code);
    const defaultModules = getDefaultAllowedModules(accountRole.stationRole);
    const defaultPermissions = getDefaultActionPermissions(accountRole.stationRole);
    await submitAdminAction(
      {
        kind: 'staff',
        staff: {
          ...staffForm,
          is_active: true,
          allowed_modules: defaultModules,
          action_permissions: defaultPermissions,
        },
      },
      'Staff account has been created.'
    );
    setStaffForm(initialStaffForm);
    setIsStaffCreateOpen(false);
  };

  const handleDoctorSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    await submitAdminAction(
      {
        kind: 'doctor',
        doctor: {
          ...doctorForm,
          is_active: true,
        },
      },
      'Doctor has been added.'
    );
    setDoctorForm(initialDoctorForm);
  };

  const handleApeEventSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    await submitAdminAction(
      {
        kind: 'ape_event',
        apeEvent: {
          ...apeEventForm,
          end_date: apeEventForm.end_date || null,
          status: 'planned',
        },
      },
      'APE event has been created.'
    );
    setApeEventForm(initialApeEventForm);
  };

  const handleStartApeMode = async (apeEventId: string) => {
    await submitAdminAction(
      {
        kind: 'ape_mode',
        action: 'start',
        apeEventId,
      },
      'APE mode is now active. New records will be tagged as APE.'
    );
  };

  const handleEndApeMode = async () => {
    await submitAdminAction(
      {
        kind: 'ape_mode',
        action: 'end',
      },
      'APE mode has been ended. New records will be tagged as OPD.'
    );
  };

  const handleSyncApeData = async () => {
    await submitAdminAction(
      {
        kind: 'ape_sync',
        apeEventId: apeRuntime.activeApeEventId,
      },
      'Sync check completed. Full cloud sync transport is still pending.'
    );
  };

  const handleMasterlistUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!masterlistFile) {
      setPageError('Select an Excel masterlist file first.');
      return;
    }

    const apeEventId = masterlistForm.apeEventId || apeRuntime.activeApeEventId || apeEvents[0]?.id || '';
    if (!apeEventId || !masterlistForm.companyName.trim()) {
      setPageError('APE event and company name are required for masterlist upload.');
      return;
    }

    setIsSaving(true);
    setPageError('');
    setPageNotice('');

    try {
      const token = await getAdminAccessToken();
      const formData = new FormData();
      formData.set('file', masterlistFile);
      formData.set('apeEventId', apeEventId);
      formData.set('companyName', masterlistForm.companyName.trim());

      const response = await fetch('/api/staff/ape-masterlist/upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });
      const payload = (await response.json().catch(() => null)) as
        | { batch?: { totalPatients: number; firstLabOrder: string; lastLabOrder: string }; error?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? 'Unable to upload APE masterlist.');
      }

      setPageNotice(
        `Masterlist uploaded. ${payload?.batch?.totalPatients ?? 0} patients generated from ${payload?.batch?.firstLabOrder ?? 'LAB-001'} to ${payload?.batch?.lastLabOrder ?? 'LAB-N'}.`
      );
      setMasterlistForm(initialMasterlistForm);
      setMasterlistFile(null);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Unable to upload APE masterlist.');
    } finally {
      setIsSaving(false);
    }
  };

  const openStaffEdit = (member: StaffProfileRow) => {
    const stationRole = mapDbRoleToStationRole(member.role);
    const fallbackModules = stationRole ? getDefaultAllowedModules(stationRole) : [];
    const fallbackPermissions = stationRole ? getDefaultActionPermissions(stationRole) : [];
    setEditingStaff(member);
    setStaffEditForm({
      full_name: member.full_name,
      role: member.role,
      department_code: member.departments?.code ?? 'administration',
      job_position_code: member.job_positions?.code ?? 'encoder',
      is_active: member.is_active,
      allowed_modules:
        member.allowed_modules && member.allowed_modules.length > 0
          ? member.allowed_modules
          : fallbackModules,
      action_permissions:
        member.action_permissions && member.action_permissions.length > 0
          ? member.action_permissions
          : fallbackPermissions,
    });
  };

  const openDoctorEdit = (doctor: DoctorRow) => {
    setEditingDoctor(doctor);
    setDoctorEditForm({
      full_name: doctor.full_name,
      is_active: doctor.is_active,
    });
  };

  const toggleCompanyServiceCode = (
    target: 'create-pre-employment' | 'create-lab' | 'edit-pre-employment' | 'edit-lab',
    serviceCode: string,
    checked: boolean
  ) => {
    const updateCodes = (currentCodes: string[]) =>
      checked
        ? Array.from(new Set([...currentCodes, serviceCode]))
        : currentCodes.filter((code) => code !== serviceCode);

    if (target === 'create-pre-employment') {
      setCompanyForm((current) => ({
        ...current,
        pre_employment_service_codes: updateCodes(current.pre_employment_service_codes),
      }));
    } else if (target === 'create-lab') {
      setCompanyForm((current) => ({
        ...current,
        lab_service_codes: updateCodes(current.lab_service_codes),
      }));
    } else if (target === 'edit-pre-employment') {
      setCompanyEditForm((current) => ({
        ...current,
        pre_employment_service_codes: updateCodes(current.pre_employment_service_codes),
      }));
    } else {
      setCompanyEditForm((current) => ({
        ...current,
        lab_service_codes: updateCodes(current.lab_service_codes),
      }));
    }
  };

  const handleStaffModuleToggle = (href: StaffModulePath, checked: boolean) => {
    setStaffEditForm((current) => ({
      ...current,
      allowed_modules: checked
        ? Array.from(new Set([...current.allowed_modules, href]))
        : current.allowed_modules.filter((item) => item !== href),
    }));
  };

  const handleStaffPermissionToggle = (permission: ActionPermission, checked: boolean) => {
    setStaffEditForm((current) => ({
      ...current,
      action_permissions: checked
        ? Array.from(new Set([...current.action_permissions, permission]))
        : current.action_permissions.filter((item) => item !== permission),
    }));
  };

  const handleStaffEditSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingStaff) {
      return;
    }

    await submitAdminAction(
      {
        kind: 'staff',
        staff: {
          id: editingStaff.id,
          email: editingStaff.email,
          full_name: staffEditForm.full_name,
          role: staffEditForm.role as StaffProfileRow['role'],
          department_code: staffEditForm.department_code,
          job_position_code: staffEditForm.job_position_code,
          is_active: staffEditForm.is_active,
          allowed_modules: staffEditForm.allowed_modules,
          action_permissions: staffEditForm.action_permissions,
        },
      },
      'Staff account permissions have been updated.'
    );

    setEditingStaff(null);
    setStaffEditForm(initialStaffEditForm);
  };

  const saveDoctor = async (
    doctor: DoctorRow,
    isActive: boolean,
    successMessage: string,
    fullName = doctor.full_name
  ) => {
    await submitAdminAction(
      {
        kind: 'doctor',
        doctor: {
          id: doctor.id,
          full_name: fullName,
          is_active: isActive,
        },
      },
      successMessage
    );
  };

  const handleDoctorEditSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingDoctor) {
      return;
    }

    await saveDoctor(
      editingDoctor,
      doctorEditForm.is_active,
      'Doctor profile has been updated.',
      doctorEditForm.full_name
    );
    setEditingDoctor(null);
    setDoctorEditForm(initialDoctorEditForm);
  };

  const handleDoctorDeactivate = async (doctor: DoctorRow) => {
    await saveDoctor(doctor, false, 'Doctor has been deactivated.');
    setEditingDoctor(null);
    setDoctorEditForm(initialDoctorEditForm);
  };

  if (stationRole === null) {
    return null;
  }

  if (!isAdmin) {
    return (
      <PageLayout>
        <div className="px-8 py-8">
          <Card className="p-10 text-center">
            <h1 className="text-2xl font-bold">Admin Access Only</h1>
            <p className="mt-3 text-muted-foreground">
              This settings workspace is only available to the system administrator account.
            </p>
          </Card>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div className="space-y-6 px-4 py-6 md:px-8 md:py-8">
        <div className="grid gap-4 xl:grid-cols-[1.15fr_1.85fr]">
          <Card className="overflow-hidden border-border/70 bg-gradient-to-br from-primary/10 via-card to-emerald-50 p-0 shadow-sm">
            <div className="border-b border-white/60 bg-background/70 px-5 py-4 backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Clinic Runtime</p>
                  <p className="mt-1 text-xl font-black">
                    {apeRuntime.apeModeEnabled ? 'APE Mission Mode' : 'OPD Walk-in Mode'}
                  </p>
                </div>
                <Badge
                  className={apeRuntime.apeModeEnabled ? 'bg-amber-600 text-white hover:bg-amber-600' : ''}
                  variant={apeRuntime.apeModeEnabled ? 'default' : 'outline'}
                >
                  {apeRuntime.apeModeEnabled ? 'Active Mission' : 'Standard Clinic'}
                </Badge>
              </div>
            </div>
            <div className="space-y-5 p-5">
              <div className="rounded-3xl border bg-background/80 p-5 shadow-sm">
                <div className="flex items-start gap-4">
                  <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                    {apeRuntime.apeModeEnabled ? <Activity className="h-6 w-6" /> : <CheckCircle2 className="h-6 w-6" />}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold">
                      {apeRuntime.apeModeEnabled
                        ? apeRuntime.activeApeEvent?.name ?? 'Mission currently active'
                        : 'Ready for regular clinic walk-ins'}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {apeRuntime.apeModeEnabled
                        ? 'New registrations, queues, payments, results, and audit logs are tagged to the selected APE event.'
                        : 'New records are tagged as OPD. Start APE mode only when the clinic is operating at a mission site.'}
                    </p>
                    {apeRuntime.activeApeEvent?.location && (
                      <p className="mt-3 flex items-center gap-2 text-sm font-medium text-primary">
                        <MapPin className="h-4 w-4" />
                        {apeRuntime.activeApeEvent.location}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <SyncStatusCard label="Pending Sync" value={apeRuntime.syncSummary.pendingCount} tone="warning" />
                <SyncStatusCard label="Conflicts" value={apeRuntime.syncSummary.conflictCount} tone="danger" />
                <SyncStatusCard label="Failed" value={apeRuntime.syncSummary.failedCount} tone="danger" />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={handleSyncApeData} disabled={isSaving} className="min-h-11">
                  <CloudUpload className="h-4 w-4" />
                  Sync to Cloud
                </Button>
                {apeRuntime.apeModeEnabled && (
                  <Button type="button" variant="destructive" onClick={handleEndApeMode} disabled={isSaving} className="min-h-11">
                    End APE Mode
                  </Button>
                )}
              </div>
            </div>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <AdminMetricCard
              label="Services"
              value={activeServices.length}
              detail="Active billable items"
              icon={DollarSign}
            />
            <AdminMetricCard
              label="Partners"
              value={activeCompanies.length}
              detail="Company packages"
              icon={Building2}
            />
            <AdminMetricCard
              label="Staff"
              value={activeStaff.length}
              detail={`${pendingStaff.length} pending review`}
              icon={Users}
              tone={pendingStaff.length > 0 ? 'warning' : 'default'}
            />
            <AdminMetricCard
              label="Doctors"
              value={activeDoctors.length}
              detail="Available directory"
              icon={Stethoscope}
              tone="success"
            />
          </div>
        </div>

        {pageNotice && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            {pageNotice}
          </div>
        )}

        {pageError && (
          <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {pageError}
          </div>
        )}

        <Card className="overflow-hidden border-border/70 shadow-sm">
          <div className="border-b bg-muted/30 px-5 py-4 md:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black tracking-tight">Mission Operations</h2>
                <p className="mt-1 text-sm text-muted-foreground">Create APE events, upload masterlists, and start mission mode from one workspace.</p>
              </div>
              <Badge variant="outline">{apeEvents.length} APE events</Badge>
            </div>
          </div>

          <div className="grid gap-5 p-5 md:p-6 xl:grid-cols-[0.85fr_1.15fr]">
            <div className="space-y-4">
              <form className="space-y-4 rounded-2xl border bg-card p-5" onSubmit={handleApeEventSubmit}>
                <div>
                  <h3 className="font-bold">Create APE Event</h3>
                  <p className="text-sm text-muted-foreground">Use one event per mission site or company schedule.</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="ape_code">APE Code</Label>
                    <Input
                      id="ape_code"
                      value={apeEventForm.ape_code}
                      onChange={(event) => setApeEventForm((current) => ({ ...current, ape_code: event.target.value }))}
                      placeholder="APE-2026-CVSU"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ape_name">APE Name</Label>
                    <Input
                      id="ape_name"
                      value={apeEventForm.name}
                      onChange={(event) => setApeEventForm((current) => ({ ...current, name: event.target.value }))}
                      placeholder="CVSU Medical Mission"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ape_location">Location</Label>
                  <Input
                    id="ape_location"
                    value={apeEventForm.location}
                    onChange={(event) => setApeEventForm((current) => ({ ...current, location: event.target.value }))}
                    placeholder="Tanza, Cavite"
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="ape_start_date">Start Date</Label>
                    <Input
                      id="ape_start_date"
                      type="date"
                      value={apeEventForm.start_date}
                      onChange={(event) => setApeEventForm((current) => ({ ...current, start_date: event.target.value }))}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ape_end_date">End Date</Label>
                    <Input
                      id="ape_end_date"
                      type="date"
                      value={apeEventForm.end_date}
                      onChange={(event) => setApeEventForm((current) => ({ ...current, end_date: event.target.value }))}
                    />
                  </div>
                </div>
                <Button type="submit" disabled={isSaving} className="w-full">
                  {isSaving ? 'Saving...' : 'Create APE Event'}
                </Button>
              </form>

              <form className="space-y-4 rounded-2xl border bg-card p-5" onSubmit={handleMasterlistUpload}>
                <div>
                  <h3 className="font-bold">Upload Mission Masterlist</h3>
                  <p className="text-sm text-muted-foreground">
                    Upload Excel, count valid patients, then generate LAB-001 to LAB-N scoped to this APE and company.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="masterlist_ape_event">APE Event</Label>
                  <select
                    id="masterlist_ape_event"
                    value={masterlistForm.apeEventId || apeRuntime.activeApeEventId || ''}
                    onChange={(event) => setMasterlistForm((current) => ({ ...current, apeEventId: event.target.value }))}
                    className="h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                    required
                  >
                    <option value="">Select APE event</option>
                    {apeEvents.map((event) => (
                      <option key={event.id} value={event.id}>
                        {event.name} ({event.ape_code})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="masterlist_company">Company / Group</Label>
                  <Input
                    id="masterlist_company"
                    value={masterlistForm.companyName}
                    onChange={(event) => setMasterlistForm((current) => ({ ...current, companyName: event.target.value }))}
                    placeholder="CVSU"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="masterlist_file">Excel File</Label>
                  <Input
                    id="masterlist_file"
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={(event) => setMasterlistFile(event.target.files?.[0] ?? null)}
                    required
                  />
                </div>
                <Button type="submit" disabled={isSaving || !masterlistFile} className="w-full">
                  <Upload className="h-4 w-4" />
                  {isSaving ? 'Uploading...' : 'Upload and Generate Lab Orders'}
                </Button>
              </form>
            </div>

            <div className="space-y-4">
              <div className="rounded-3xl border bg-card p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-black">APE Events</h3>
                    <p className="mt-1 text-sm text-muted-foreground">Start the event when the clinic is already operating at the mission site.</p>
                  </div>
                  <Badge variant="secondary">{apeEvents.filter((event) => event.status === 'active').length} active</Badge>
                </div>
                <div className="mt-4 space-y-3">
                  {apeEvents.slice(0, 6).map((event) => (
                    <div key={event.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-background p-4 transition hover:border-primary/30 hover:bg-primary/5">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-bold">{event.name}</p>
                          <Badge
                            className={event.status === 'active' ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' : ''}
                            variant={event.status === 'active' ? 'default' : 'outline'}
                          >
                            {event.status}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{event.ape_code}</p>
                        {event.location && (
                          <p className="mt-2 flex items-center gap-1 text-sm text-muted-foreground">
                            <MapPin className="h-3.5 w-3.5" />
                            {event.location}
                          </p>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant={apeRuntime.activeApeEventId === event.id ? 'secondary' : 'outline'}
                        className="min-h-11"
                        onClick={() => handleStartApeMode(event.id)}
                        disabled={isSaving || apeRuntime.activeApeEventId === event.id || event.status === 'completed'}
                      >
                        <PlayCircle className="h-4 w-4" />
                        {apeRuntime.activeApeEventId === event.id ? 'Active' : 'Start APE'}
                      </Button>
                    </div>
                  ))}
                  {!apeEvents.length && (
                    <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                      No APE events yet. Create one before going to a mission site.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Tabs defaultValue="services" className="space-y-5">
          <TabsList className="sticky top-20 z-20 grid h-auto grid-cols-2 gap-2 rounded-3xl border bg-background/95 p-2 shadow-sm backdrop-blur xl:grid-cols-4">
            <TabsTrigger value="services" className="min-h-12 gap-2 rounded-2xl border bg-card data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <DollarSign className="h-4 w-4" />
              Service Pricing
            </TabsTrigger>
            <TabsTrigger value="companies" className="min-h-12 gap-2 rounded-2xl border bg-card data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Building2 className="h-4 w-4" />
              Partner Companies
            </TabsTrigger>
            <TabsTrigger value="doctors" className="min-h-12 gap-2 rounded-2xl border bg-card data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Stethoscope className="h-4 w-4" />
              Doctors
            </TabsTrigger>
            <TabsTrigger value="staff" className="min-h-12 gap-2 rounded-2xl border bg-card data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Users className="h-4 w-4" />
              Staff Accounts
            </TabsTrigger>
          </TabsList>

          <TabsContent value="services" className="mt-0">
            <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
              <Card className="p-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-primary/10 p-3 text-primary">
                    <DollarSign className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">Add or Update Service</h2>
                    <p className="text-sm text-muted-foreground">These prices feed the cashier billing screen.</p>
                  </div>
                </div>

                <form className="mt-6 space-y-4" onSubmit={handleServiceSubmit}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="service_code">Service Code</Label>
                      <Input id="service_code" value={serviceForm.service_code} onChange={(event) => setServiceForm((current) => ({ ...current, service_code: event.target.value }))} placeholder="svc-blood-test" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="service_name">Service Name</Label>
                      <Input id="service_name" value={serviceForm.service_name} onChange={(event) => setServiceForm((current) => ({ ...current, service_name: event.target.value }))} placeholder="Blood Test Service" required />
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-4">
                    <div className="space-y-2">
                      <Label htmlFor="service_category">Category</Label>
                      <Input id="service_category" value={serviceForm.category} onChange={(event) => setServiceForm((current) => ({ ...current, category: event.target.value }))} placeholder="Laboratory" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="service_lane">Lab Lane</Label>
                      <select
                        id="service_lane"
                        value={serviceForm.service_lane}
                        onChange={(event) => setServiceForm((current) => ({ ...current, service_lane: event.target.value }))}
                        className="h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                      >
                        <option value="">Not a lab test</option>
                        <option value="blood_test">Blood Test</option>
                        <option value="drug_test">Drug Test</option>
                        <option value="xray">Xray</option>
                        <option value="ecg">ECG</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="service_amount">Price</Label>
                      <Input id="service_amount" type="number" min="0" step="0.01" value={serviceForm.amount} onChange={(event) => setServiceForm((current) => ({ ...current, amount: event.target.value }))} required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="service_sort">Sort Order</Label>
                      <Input id="service_sort" type="number" min="1" value={serviceForm.sort_order} onChange={(event) => setServiceForm((current) => ({ ...current, sort_order: event.target.value }))} required />
                    </div>
                  </div>
                  <Button type="submit" disabled={isSaving} className="w-full">
                    {isSaving ? 'Saving...' : 'Save Service Pricing'}
                  </Button>
                </form>
              </Card>

              <Card className="p-6">
                <h2 className="text-xl font-bold">Current Price Catalog</h2>
                <p className="mt-1 text-sm text-muted-foreground">Live list of billable items available to cashier.</p>
                <div className="mt-5">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Service</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Lane</TableHead>
                        <TableHead>Price</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {services.map((service) => (
                        <TableRow key={service.id}>
                          <TableCell>
                            <div>
                              <p className="font-semibold">{service.service_name}</p>
                              <p className="text-xs text-muted-foreground">{service.service_code}</p>
                            </div>
                          </TableCell>
                          <TableCell>{service.category}</TableCell>
                          <TableCell>{service.service_lane ? service.service_lane.replaceAll('_', ' ') : 'N/A'}</TableCell>
                          <TableCell>{formatCurrency(Number(service.amount ?? 0))}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{service.is_active ? 'Active' : 'Inactive'}</Badge>
                          </TableCell>
                          <TableCell className="w-16 text-right">
                            <Button type="button" variant="ghost" size="icon" onClick={() => openServiceEdit(service)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {!services.length && !isLoading && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground">
                            No service catalog entries found.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="companies" className="mt-0">
            <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
              <Card className="p-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-primary/10 p-3 text-primary">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">Add Partner Company</h2>
                    <p className="text-sm text-muted-foreground">Store companies like SM, STI, and other clinic partners.</p>
                  </div>
                </div>

                <form className="mt-6 space-y-4" onSubmit={handleCompanySubmit}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="company_code">Company Code</Label>
                      <Input id="company_code" value={companyForm.company_code} onChange={(event) => setCompanyForm((current) => ({ ...current, company_code: event.target.value }))} placeholder="sti" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="company_name">Company Name</Label>
                      <Input id="company_name" value={companyForm.company_name} onChange={(event) => setCompanyForm((current) => ({ ...current, company_name: event.target.value }))} placeholder="STI" required />
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="company_contact_person">Contact Person</Label>
                      <Input id="company_contact_person" value={companyForm.contact_person} onChange={(event) => setCompanyForm((current) => ({ ...current, contact_person: event.target.value }))} placeholder="Account officer" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="company_contact_number">Contact Number</Label>
                      <Input id="company_contact_number" value={companyForm.contact_number} onChange={(event) => setCompanyForm((current) => ({ ...current, contact_number: event.target.value }))} placeholder="+63..." />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company_email">Email Address</Label>
                    <Input id="company_email" type="email" value={companyForm.email_address} onChange={(event) => setCompanyForm((current) => ({ ...current, email_address: event.target.value }))} placeholder="partner@company.com" />
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="company_pre_employment_amount">Pre-Employment Price</Label>
                      <Input
                        id="company_pre_employment_amount"
                        type="number"
                        min="0"
                        step="0.01"
                        value={companyForm.pre_employment_amount}
                        onChange={(event) =>
                          setCompanyForm((current) => ({
                            ...current,
                            pre_employment_amount: event.target.value,
                          }))
                        }
                        placeholder="850.00"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="company_check_up_amount">Check-Up Price</Label>
                      <Input
                        id="company_check_up_amount"
                        type="number"
                        min="0"
                        step="0.01"
                        value={companyForm.check_up_amount}
                        onChange={(event) =>
                          setCompanyForm((current) => ({
                            ...current,
                            check_up_amount: event.target.value,
                          }))
                        }
                        placeholder="500.00"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="company_lab_amount">Lab Price</Label>
                      <Input
                        id="company_lab_amount"
                        type="number"
                        min="0"
                        step="0.01"
                        value={companyForm.lab_amount}
                        onChange={(event) =>
                          setCompanyForm((current) => ({
                            ...current,
                            lab_amount: event.target.value,
                          }))
                        }
                        placeholder="250.00"
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-3 rounded-lg border p-4">
                      <Label>Pre-Employment Requirements</Label>
                      <div className="grid gap-2">
                        {activeLabServices.map((service) => (
                          <label key={service.service_code} className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={companyForm.pre_employment_service_codes.includes(service.service_code)}
                              onCheckedChange={(checked) =>
                                toggleCompanyServiceCode('create-pre-employment', service.service_code, checked === true)
                              }
                            />
                            <span>{service.service_name}</span>
                          </label>
                        ))}
                        {!activeLabServices.length && (
                          <p className="text-sm text-muted-foreground">Add active lab services first.</p>
                        )}
                      </div>
                    </div>
                    <div className="space-y-3 rounded-lg border p-4">
                      <Label>Default Lab Requirements</Label>
                      <div className="grid gap-2">
                        {activeLabServices.map((service) => (
                          <label key={service.service_code} className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={companyForm.lab_service_codes.includes(service.service_code)}
                              onCheckedChange={(checked) =>
                                toggleCompanyServiceCode('create-lab', service.service_code, checked === true)
                              }
                            />
                            <span>{service.service_name}</span>
                          </label>
                        ))}
                        {!activeLabServices.length && (
                          <p className="text-sm text-muted-foreground">Add active lab services first.</p>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company_notes">Notes</Label>
                    <Textarea id="company_notes" value={companyForm.notes} onChange={(event) => setCompanyForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Agreement notes or remarks" />
                  </div>
                  <Button type="submit" disabled={isSaving} className="w-full">
                    {isSaving ? 'Saving...' : 'Save Partner Company'}
                  </Button>
                </form>
              </Card>

              <Card className="p-6">
                <h2 className="text-xl font-bold">Current Partner List</h2>
                <p className="mt-1 text-sm text-muted-foreground">Reference companies available to the clinic.</p>
                <div className="mt-5">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Company</TableHead>
                        <TableHead>Packages</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {companies.map((company) => (
                        <TableRow key={company.id}>
                          <TableCell>
                            <div>
                              <p className="font-semibold">{company.company_name}</p>
                              <p className="text-xs text-muted-foreground">{company.company_code}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1 text-xs">
                              <p>Pre-Employment: {formatCurrency(Number(company.preEmploymentAmount ?? 0))}</p>
                              <p>Check-Up: {formatCurrency(Number(company.checkUpAmount ?? 0))}</p>
                              <p>Lab: {formatCurrency(Number(company.labAmount ?? 0))}</p>
                              <p>Requirements: {(company.preEmploymentServiceCodes ?? []).length || 0} tests</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <p>{company.contact_person || 'No contact person'}</p>
                            <p className="text-xs text-muted-foreground">{company.contact_number || company.email_address || 'No contact details'}</p>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{company.is_active ? 'Active' : 'Inactive'}</Badge>
                          </TableCell>
                          <TableCell className="w-16 text-right">
                            <Button type="button" variant="ghost" size="icon" onClick={() => openCompanyEdit(company)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {!companies.length && !isLoading && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground">
                            No partner companies found.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="doctors" className="mt-0">
            <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
              <Card className="p-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-primary/10 p-3 text-primary">
                    <Stethoscope className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">Add Doctor</h2>
                    <p className="text-sm text-muted-foreground">These names are used for check-up doctor assignment.</p>
                  </div>
                </div>

                <form className="mt-6 space-y-4" onSubmit={handleDoctorSubmit}>
                  <div className="space-y-2">
                    <Label htmlFor="doctor_name">Full Name</Label>
                    <Input
                      id="doctor_name"
                      value={doctorForm.full_name}
                      onChange={(event) =>
                        setDoctorForm((current) => ({ ...current, full_name: event.target.value }))
                      }
                      placeholder="Dr. Jane Doe"
                      required
                    />
                  </div>
                  <Button type="submit" disabled={isSaving} className="w-full">
                    {isSaving ? 'Saving doctor...' : 'Add Doctor'}
                  </Button>
                </form>
              </Card>

              <Card className="p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold">Doctor Directory</h2>
                    <p className="mt-1 text-sm text-muted-foreground">Manage names available in the check-up assignment dropdown.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                      {activeDoctors.length} active
                    </Badge>
                    <Badge variant="outline">{doctors.length} total</Badge>
                  </div>
                </div>

                <div className="mt-5">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Doctor</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {doctors.map((doctor) => (
                        <TableRow key={doctor.id}>
                          <TableCell>
                            <div>
                              <p className="font-semibold">{doctor.full_name}</p>
                              <p className="text-xs text-muted-foreground">Doctor directory</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={
                                doctor.is_active
                                  ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100'
                                  : 'bg-amber-100 text-amber-700 hover:bg-amber-100'
                              }
                            >
                              {doctor.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>
                          <TableCell className="w-24 text-right">
                            <div className="flex justify-end gap-1">
                              <Button type="button" variant="ghost" size="icon" onClick={() => openDoctorEdit(doctor)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              {doctor.is_active && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => void handleDoctorDeactivate(doctor)}
                                  disabled={isSaving}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {!doctors.length && !isLoading && (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-muted-foreground">
                            No doctor accounts found.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="staff" className="mt-0">
            <div>
              <Card className="hidden">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-primary/10 p-3 text-primary">
                    <ShieldPlus className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">Create Staff Account</h2>
                    <p className="text-sm text-muted-foreground">This creates both the auth user and the staff profile.</p>
                  </div>
                </div>

                <form className="mt-6 space-y-4" onSubmit={handleStaffSubmit}>
                  <div className="space-y-2">
                    <Label htmlFor="staff_name">Full Name</Label>
                    <Input id="staff_name" value={staffForm.full_name} onChange={(event) => setStaffForm((current) => ({ ...current, full_name: event.target.value }))} placeholder="Jane Doe" required />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="staff_email">Email Address</Label>
                      <Input id="staff_email" type="email" value={staffForm.email} onChange={(event) => setStaffForm((current) => ({ ...current, email: event.target.value }))} placeholder="user@globalife.local" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="staff_password">Temporary Password</Label>
                      <Input id="staff_password" type="password" value={staffForm.password} onChange={(event) => setStaffForm((current) => ({ ...current, password: event.target.value }))} placeholder="••••••••" required />
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                    <Label htmlFor="staff_department">Department</Label>
                    <select
                      id="staff_department"
                      value={staffForm.department_code}
                      onChange={(event) => setStaffForm((current) => ({ ...current, department_code: event.target.value as DepartmentCode }))}
                      className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      {departmentCatalog.map((department) => <option key={department.code} value={department.code}>{department.label}</option>)}
                    </select>
                    </div>
                    <div className="space-y-2">
                    <Label htmlFor="staff_position">Job Position</Label>
                    <select
                      id="staff_position"
                      value={staffForm.job_position_code}
                      onChange={(event) => setStaffForm((current) => ({ ...current, job_position_code: event.target.value as JobPositionCode }))}
                      className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      {jobPositionCatalog.map((position) => <option key={position.code} value={position.code}>{position.label}</option>)}
                    </select>
                    </div>
                  </div>
                  <Button type="submit" disabled={isSaving} className="w-full">
                    {isSaving ? 'Creating account...' : 'Create Staff Account'}
                  </Button>
                </form>
              </Card>

              <Card className="overflow-hidden border-border/70 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b bg-muted/30 px-5 py-4 md:px-6">
                  <div>
                    <h2 className="text-xl font-black tracking-tight">Current User Accounts</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Manage each staff member's department, job position, module access, and activation status.
                    </p>
                  </div>
                  <Button type="button" onClick={() => setIsStaffCreateOpen(true)} className="min-h-11">
                    <ShieldPlus className="h-4 w-4" />
                    Add Staff Account
                  </Button>
                </div>
                <div className="p-5 md:p-6">
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant={staffFilter === 'all' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setStaffFilter('all')}
                    >
                      All Staff
                    </Button>
                    <Button
                      type="button"
                      variant={staffFilter === 'pending' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setStaffFilter('pending')}
                    >
                      Pending Activation
                    </Button>
                    <Button
                      type="button"
                      variant={staffFilter === 'active' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setStaffFilter('active')}
                    >
                      Active Only
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
                      {pendingStaff.length} pending
                    </Badge>
                    <Badge variant="outline">{activeStaff.length} active</Badge>
                  </div>
                </div>
                <div className="mt-5">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>Position</TableHead>
                        <TableHead>Modules</TableHead>
                        <TableHead>Lane</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredStaff.map((member) => (
                        <TableRow key={member.id}>
                          <TableCell>
                            <div>
                              <p className="font-semibold">{member.full_name}</p>
                              <p className="text-xs text-muted-foreground">{member.email}</p>
                            </div>
                          </TableCell>
                          <TableCell>{getDepartmentLabel(member.departments?.code)}</TableCell>
                          <TableCell>{getJobPositionLabel(member.job_positions?.code)}</TableCell>
                          <TableCell>
                            <p className="text-sm">
                              {(member.allowed_modules?.length ?? 0) > 0
                                ? `${member.allowed_modules?.length ?? 0} enabled`
                                : 'Role default'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {(member.action_permissions?.length ?? 0) > 0
                                ? `${member.action_permissions?.length ?? 0} actions`
                                : 'Role default actions'}
                            </p>
                          </TableCell>
                          <TableCell>{member.assigned_lane || 'All / None'}</TableCell>
                          <TableCell>
                            <Badge
                              className={
                                member.is_active
                                  ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100'
                                  : 'bg-amber-100 text-amber-700 hover:bg-amber-100'
                              }
                            >
                              {member.is_active ? 'Active' : 'Pending Activation'}
                            </Badge>
                          </TableCell>
                          <TableCell className="w-16 text-right">
                            <Button type="button" variant="ghost" size="icon" onClick={() => openStaffEdit(member)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {!filteredStaff.length && !isLoading && (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground">
                            {staffFilter === 'pending'
                              ? 'No pending staff accounts found.'
                              : staffFilter === 'active'
                                ? 'No active staff accounts found.'
                                : 'No staff profiles found.'}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
                </div>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog
        open={isStaffCreateOpen}
        onOpenChange={(open) => {
          setIsStaffCreateOpen(open);
          if (!open) {
            setStaffForm(initialStaffForm);
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Staff Account</DialogTitle>
            <DialogDescription>
              Create one account per staff member. The selected department and job position define the default modules and permissions.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleStaffSubmit}>
            <div className="space-y-2">
              <Label htmlFor="create_staff_name">Full Name</Label>
              <Input
                id="create_staff_name"
                value={staffForm.full_name}
                onChange={(event) => setStaffForm((current) => ({ ...current, full_name: event.target.value }))}
                placeholder="Jane Doe"
                required
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="create_staff_email">Email Address</Label>
                <Input
                  id="create_staff_email"
                  type="email"
                  value={staffForm.email}
                  onChange={(event) => setStaffForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="user@globalife.local"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create_staff_password">Temporary Password</Label>
                <Input
                  id="create_staff_password"
                  type="password"
                  value={staffForm.password}
                  onChange={(event) => setStaffForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder="Set temporary password"
                  required
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="create_staff_department">Department</Label>
                <select
                  id="create_staff_department"
                  value={staffForm.department_code}
                  onChange={(event) => setStaffForm((current) => ({ ...current, department_code: event.target.value as DepartmentCode }))}
                  className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {departmentCatalog.map((department) => (
                    <option key={department.code} value={department.code}>
                      {department.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="create_staff_position">Job Position</Label>
                <select
                  id="create_staff_position"
                  value={staffForm.job_position_code}
                  onChange={(event) => setStaffForm((current) => ({ ...current, job_position_code: event.target.value as JobPositionCode }))}
                  className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {jobPositionCatalog.map((position) => (
                    <option key={position.code} value={position.code}>
                      {position.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="rounded-2xl border bg-muted/40 p-4 text-sm text-muted-foreground">
              After creation, open the staff row to fine-tune module access or special action permissions if needed.
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsStaffCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Creating account...' : 'Create Staff Account'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingService)} onOpenChange={(open) => !open && setEditingService(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Service Pricing</DialogTitle>
            <DialogDescription>Update the service details that cashier will use for billing.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleServiceEditSubmit}>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="edit_service_code">Service Code</Label>
                <Input id="edit_service_code" value={serviceEditForm.service_code} onChange={(event) => setServiceEditForm((current) => ({ ...current, service_code: event.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_service_name">Service Name</Label>
                <Input id="edit_service_name" value={serviceEditForm.service_name} onChange={(event) => setServiceEditForm((current) => ({ ...current, service_name: event.target.value }))} required />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="edit_service_category">Category</Label>
                <Input id="edit_service_category" value={serviceEditForm.category} onChange={(event) => setServiceEditForm((current) => ({ ...current, category: event.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_service_lane">Lab Lane</Label>
                <select
                  id="edit_service_lane"
                  value={serviceEditForm.service_lane}
                  onChange={(event) => setServiceEditForm((current) => ({ ...current, service_lane: event.target.value }))}
                  className="h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                >
                  <option value="">Not a lab test</option>
                  <option value="blood_test">Blood Test</option>
                  <option value="drug_test">Drug Test</option>
                  <option value="xray">Xray</option>
                  <option value="ecg">ECG</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_service_amount">Price</Label>
                <Input id="edit_service_amount" type="number" min="0" step="0.01" value={serviceEditForm.amount} onChange={(event) => setServiceEditForm((current) => ({ ...current, amount: event.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_service_sort">Sort Order</Label>
                <Input id="edit_service_sort" type="number" min="1" value={serviceEditForm.sort_order} onChange={(event) => setServiceEditForm((current) => ({ ...current, sort_order: event.target.value }))} required />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingService(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingCompany)} onOpenChange={(open) => !open && setEditingCompany(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Partner Company</DialogTitle>
            <DialogDescription>Update the saved company details used across the clinic workflow.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleCompanyEditSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit_company_code">Company Code</Label>
                <Input id="edit_company_code" value={companyEditForm.company_code} onChange={(event) => setCompanyEditForm((current) => ({ ...current, company_code: event.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_company_name">Company Name</Label>
                <Input id="edit_company_name" value={companyEditForm.company_name} onChange={(event) => setCompanyEditForm((current) => ({ ...current, company_name: event.target.value }))} required />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit_company_contact_person">Contact Person</Label>
                <Input id="edit_company_contact_person" value={companyEditForm.contact_person} onChange={(event) => setCompanyEditForm((current) => ({ ...current, contact_person: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_company_contact_number">Contact Number</Label>
                <Input id="edit_company_contact_number" value={companyEditForm.contact_number} onChange={(event) => setCompanyEditForm((current) => ({ ...current, contact_number: event.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_company_email">Email Address</Label>
              <Input id="edit_company_email" type="email" value={companyEditForm.email_address} onChange={(event) => setCompanyEditForm((current) => ({ ...current, email_address: event.target.value }))} />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="edit_company_pre_employment_amount">Pre-Employment Price</Label>
                <Input
                  id="edit_company_pre_employment_amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={companyEditForm.pre_employment_amount}
                  onChange={(event) =>
                    setCompanyEditForm((current) => ({
                      ...current,
                      pre_employment_amount: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_company_check_up_amount">Check-Up Price</Label>
                <Input
                  id="edit_company_check_up_amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={companyEditForm.check_up_amount}
                  onChange={(event) =>
                    setCompanyEditForm((current) => ({
                      ...current,
                      check_up_amount: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_company_lab_amount">Lab Price</Label>
                <Input
                  id="edit_company_lab_amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={companyEditForm.lab_amount}
                  onChange={(event) =>
                    setCompanyEditForm((current) => ({
                      ...current,
                      lab_amount: event.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3 rounded-lg border p-4">
                <Label>Pre-Employment Requirements</Label>
                <div className="grid gap-2">
                  {activeLabServices.map((service) => (
                    <label key={service.service_code} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={companyEditForm.pre_employment_service_codes.includes(service.service_code)}
                        onCheckedChange={(checked) =>
                          toggleCompanyServiceCode('edit-pre-employment', service.service_code, checked === true)
                        }
                      />
                      <span>{service.service_name}</span>
                    </label>
                  ))}
                  {!activeLabServices.length && (
                    <p className="text-sm text-muted-foreground">Add active lab services first.</p>
                  )}
                </div>
              </div>
              <div className="space-y-3 rounded-lg border p-4">
                <Label>Default Lab Requirements</Label>
                <div className="grid gap-2">
                  {activeLabServices.map((service) => (
                    <label key={service.service_code} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={companyEditForm.lab_service_codes.includes(service.service_code)}
                        onCheckedChange={(checked) =>
                          toggleCompanyServiceCode('edit-lab', service.service_code, checked === true)
                        }
                      />
                      <span>{service.service_name}</span>
                    </label>
                  ))}
                  {!activeLabServices.length && (
                    <p className="text-sm text-muted-foreground">Add active lab services first.</p>
                  )}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_company_notes">Notes</Label>
              <Textarea id="edit_company_notes" value={companyEditForm.notes} onChange={(event) => setCompanyEditForm((current) => ({ ...current, notes: event.target.value }))} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingCompany(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingDoctor)} onOpenChange={(open) => !open && setEditingDoctor(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit Doctor</DialogTitle>
            <DialogDescription>Update doctor directory details and assignment availability.</DialogDescription>
          </DialogHeader>
          <form className="space-y-5" onSubmit={handleDoctorEditSubmit}>
            <div className="space-y-2">
              <Label htmlFor="edit_doctor_name">Full Name</Label>
              <Input
                id="edit_doctor_name"
                value={doctorEditForm.full_name}
                onChange={(event) =>
                  setDoctorEditForm((current) => ({ ...current, full_name: event.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_doctor_record">Record Type</Label>
              <Input id="edit_doctor_record" value="Doctor directory entry" disabled />
            </div>
            <div className="flex items-center justify-between rounded-xl border p-4">
              <div>
                <p className="font-semibold">Doctor Status</p>
                <p className="text-sm text-muted-foreground">Inactive doctors are removed from assignment choices.</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  {doctorEditForm.is_active ? 'Active' : 'Inactive'}
                </span>
                <Switch
                  checked={doctorEditForm.is_active}
                  onCheckedChange={(checked) =>
                    setDoctorEditForm((current) => ({ ...current, is_active: checked }))
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingDoctor(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Doctor'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingStaff)} onOpenChange={(open) => !open && setEditingStaff(null)}>
        <DialogContent className="flex max-h-[92dvh] flex-col overflow-hidden p-0 sm:max-w-4xl">
          <DialogHeader className="border-b px-6 py-5">
            <DialogTitle>Edit Staff Access</DialogTitle>
            <DialogDescription>Control which modules this staff account can access from the sidebar.</DialogDescription>
          </DialogHeader>
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleStaffEditSubmit}>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="edit_staff_name">Full Name</Label>
                  <Input
                    id="edit_staff_name"
                    value={staffEditForm.full_name}
                    onChange={(event) =>
                      setStaffEditForm((current) => ({ ...current, full_name: event.target.value }))
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_staff_department">Department</Label>
                  <select id="edit_staff_department" value={staffEditForm.department_code} onChange={(event) => setStaffEditForm((current) => ({ ...current, department_code: event.target.value as DepartmentCode }))} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    {departmentCatalog.map((department) => <option key={department.code} value={department.code}>{department.label}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_staff_position">Job Position</Label>
                  <select id="edit_staff_position" value={staffEditForm.job_position_code} onChange={(event) => setStaffEditForm((current) => ({ ...current, job_position_code: event.target.value as JobPositionCode }))} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    {jobPositionCatalog.map((position) => <option key={position.code} value={position.code}>{position.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl border bg-muted/30 p-4">
                <div>
                  <p className="font-semibold">Account Status</p>
                  <p className="text-sm text-muted-foreground">Inactive staff cannot access the system even if the account exists.</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">
                    {staffEditForm.is_active ? 'Active' : 'Inactive'}
                  </span>
                  <Switch
                    checked={staffEditForm.is_active}
                    onCheckedChange={(checked) =>
                      setStaffEditForm((current) => ({ ...current, is_active: checked }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="font-semibold">Allowed Modules</p>
                  <p className="text-sm text-muted-foreground">Only modules valid for this role should be enabled. The sidebar will hide everything else.</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {moduleCatalog.map((moduleItem) => {
                    const stationRole = getLegacyRoleForAccount(staffEditForm.department_code, staffEditForm.job_position_code).stationRole;
                    const roleDefaults = getDefaultAllowedModules(stationRole);
                    const isRoleSupported = roleDefaults.includes(moduleItem.href);

                    return (
                      <label
                        key={moduleItem.href}
                        className={`flex min-h-16 items-center gap-3 rounded-xl border p-3 ${
                          isRoleSupported ? 'bg-background' : 'border-dashed bg-sky-50/50'
                        }`}
                      >
                        <Checkbox
                          checked={staffEditForm.allowed_modules.includes(moduleItem.href)}
                          onCheckedChange={(checked) =>
                            handleStaffModuleToggle(moduleItem.href, Boolean(checked))
                          }
                        />
                        <div className="min-w-0">
                          <p className="font-medium leading-tight">{moduleItem.label}</p>
                          {!isRoleSupported && (
                            <p className="text-xs text-sky-700">Extra access outside role default</p>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="font-semibold">Action Permissions</p>
                  <p className="text-sm text-muted-foreground">
                    Sensitive actions are enforced in both the UI and API.
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {actionPermissionCatalog.map((permissionItem) => (
                    <label key={permissionItem.key} className="flex items-start gap-3 rounded-xl border p-3">
                      <Checkbox
                        checked={staffEditForm.action_permissions.includes(permissionItem.key)}
                        onCheckedChange={(checked) =>
                          handleStaffPermissionToggle(permissionItem.key, Boolean(checked))
                        }
                      />
                    <div>
                      <p className="font-medium">{permissionItem.label}</p>
                      <p className="text-xs text-muted-foreground">{permissionItem.description}</p>
                    </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <DialogFooter className="border-t bg-background px-6 py-4">
              <Button type="button" variant="outline" onClick={() => setEditingStaff(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Staff Access'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}
