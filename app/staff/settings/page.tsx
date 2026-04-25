'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Building2, DollarSign, Pencil, ShieldPlus, Stethoscope, Trash2, Users } from 'lucide-react';
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
  updated_at?: string;
};

type DoctorRow = {
  id: string;
  full_name: string;
  is_active: boolean;
  updated_at?: string;
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
  role: 'nurse',
};

const initialDoctorForm = {
  full_name: '',
};

const initialStaffEditForm = {
  full_name: '',
  role: 'nurse',
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

export default function AdminSettingsPage() {
  const [stationRole, setStationRole] = useState<string | null>(null);
  const [services, setServices] = useState<ServiceCatalogRow[]>([]);
  const [companies, setCompanies] = useState<PartnerCompanyRow[]>([]);
  const [doctors, setDoctors] = useState<DoctorRow[]>([]);
  const [staff, setStaff] = useState<StaffProfileRow[]>([]);
  const [pageError, setPageError] = useState('');
  const [pageNotice, setPageNotice] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [serviceForm, setServiceForm] = useState(initialServiceForm);
  const [companyForm, setCompanyForm] = useState(initialCompanyForm);
  const [staffForm, setStaffForm] = useState(initialStaffForm);
  const [doctorForm, setDoctorForm] = useState(initialDoctorForm);
  const [staffFilter, setStaffFilter] = useState<'all' | 'pending' | 'active'>('all');
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
      };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to load admin settings.');
      }

      setServices(payload.services ?? []);
      setCompanies(payload.companies ?? []);
      setDoctors(payload.doctors ?? []);
      setStaff(payload.staff ?? []);
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
    const defaultModules = mapDbRoleToStationRole(staffForm.role)
      ? getDefaultAllowedModules(mapDbRoleToStationRole(staffForm.role)!)
      : [];
    const defaultPermissions = mapDbRoleToStationRole(staffForm.role)
      ? getDefaultActionPermissions(mapDbRoleToStationRole(staffForm.role)!)
      : [];
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

  const openStaffEdit = (member: StaffProfileRow) => {
    const stationRole = mapDbRoleToStationRole(member.role);
    const fallbackModules = stationRole ? getDefaultAllowedModules(stationRole) : [];
    const fallbackPermissions = stationRole ? getDefaultActionPermissions(stationRole) : [];
    setEditingStaff(member);
    setStaffEditForm({
      full_name: member.full_name,
      role: member.role,
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
      <div className="px-8 py-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-primary">Admin Controls</p>
            <h1 className="mt-2 text-3xl font-bold">System Settings</h1>
            <p className="mt-2 max-w-3xl text-muted-foreground">
              Manage pricing, partner companies, and staff accounts from one workspace. Changes here
              directly affect the operational workflow, especially cashier billing and clinic setup.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <Card className="min-w-32 p-4 text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Active Services</p>
              <p className="mt-2 text-3xl font-black text-primary">{activeServices.length}</p>
            </Card>
            <Card className="min-w-32 p-4 text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Partners</p>
              <p className="mt-2 text-3xl font-black">{activeCompanies.length}</p>
            </Card>
            <Card className="min-w-32 p-4 text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Staff Users</p>
              <p className="mt-2 text-3xl font-black">{activeStaff.length}</p>
            </Card>
            <Card className="min-w-32 p-4 text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Doctors</p>
              <p className="mt-2 text-3xl font-black">{activeDoctors.length}</p>
            </Card>
          </div>
        </div>

        {pageNotice && (
          <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {pageNotice}
          </div>
        )}

        {pageError && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {pageError}
          </div>
        )}

        <Tabs defaultValue="services" className="mt-8">
          <TabsList className="grid h-auto grid-cols-4 gap-2 bg-transparent p-0">
            <TabsTrigger value="services" className="h-11 border">
              <DollarSign className="h-4 w-4" />
              Service Pricing
            </TabsTrigger>
            <TabsTrigger value="companies" className="h-11 border">
              <Building2 className="h-4 w-4" />
              Partner Companies
            </TabsTrigger>
            <TabsTrigger value="doctors" className="h-11 border">
              <Stethoscope className="h-4 w-4" />
              Doctors
            </TabsTrigger>
            <TabsTrigger value="staff" className="h-11 border">
              <Users className="h-4 w-4" />
              Staff Accounts
            </TabsTrigger>
          </TabsList>

          <TabsContent value="services" className="mt-6">
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

          <TabsContent value="companies" className="mt-6">
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

          <TabsContent value="doctors" className="mt-6">
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

          <TabsContent value="staff" className="mt-6">
            <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
              <Card className="p-6">
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
                  <div className="space-y-2">
                    <Label htmlFor="staff_role">Role</Label>
                    <select
                      id="staff_role"
                      value={staffForm.role}
                      onChange={(event) => setStaffForm((current) => ({ ...current, role: event.target.value }))}
                      className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="admin">Admin</option>
                      <option value="nurse">Nurse</option>
                      <option value="blood_test">Blood Test</option>
                      <option value="drug_test">Drug Test</option>
                      <option value="doctor">Doctor</option>
                      <option value="xray">Xray</option>
                      <option value="ecg">ECG</option>
                      <option value="encoder">Encoder</option>
                      <option value="cashier">Cashier</option>
                      <option value="pathologist">Pathologist</option>
                    </select>
                  </div>
                  <Button type="submit" disabled={isSaving} className="w-full">
                    {isSaving ? 'Creating account...' : 'Create Staff Account'}
                  </Button>
                </form>
              </Card>

              <Card className="p-6">
                <h2 className="text-xl font-bold">Current User Accounts</h2>
                <p className="mt-1 text-sm text-muted-foreground">Overview of staff profiles already registered in the system. Edit a staff row to control module access and activation.</p>
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
                        <TableHead>Role</TableHead>
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
                          <TableCell>{member.role}</TableCell>
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
                          <TableCell colSpan={6} className="text-center text-muted-foreground">
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
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={Boolean(editingService)} onOpenChange={(open) => !open && setEditingService(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Service Pricing</DialogTitle>
            <DialogDescription>Update the service details that cashier will use for billing.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleServiceEditSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
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
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Edit Staff Access</DialogTitle>
            <DialogDescription>Control which modules this staff account can access from the sidebar.</DialogDescription>
          </DialogHeader>
          <form className="space-y-5" onSubmit={handleStaffEditSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
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
                <Label htmlFor="edit_staff_role">Role</Label>
                <Input id="edit_staff_role" value={staffEditForm.role} disabled />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border p-4">
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
              <div className="grid gap-3 md:grid-cols-2">
                {moduleCatalog.map((moduleItem) => {
                  const stationRole = mapDbRoleToStationRole(staffEditForm.role);
                  const roleDefaults = stationRole ? getDefaultAllowedModules(stationRole) : [];
                  const isRoleSupported = roleDefaults.includes(moduleItem.href);

                  return (
                    <label
                      key={moduleItem.href}
                      className={`flex items-center gap-3 rounded-xl border p-3 ${
                        isRoleSupported ? 'bg-background' : 'bg-muted/40 opacity-60'
                      }`}
                    >
                      <Checkbox
                        checked={staffEditForm.allowed_modules.includes(moduleItem.href)}
                        disabled={!isRoleSupported}
                        onCheckedChange={(checked) =>
                          handleStaffModuleToggle(moduleItem.href, Boolean(checked))
                        }
                      />
                      <div>
                        <p className="font-medium">{moduleItem.label}</p>
                        {!isRoleSupported && (
                          <p className="text-xs text-muted-foreground">Not available for this role</p>
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

            <DialogFooter>
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
