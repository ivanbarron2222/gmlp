'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Building2, DollarSign, Pencil, ShieldPlus, Users } from 'lucide-react';
import { PageLayout } from '@/components/layout/page-layout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
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

type ServiceCatalogRow = {
  id: string;
  service_code: string;
  service_name: string;
  category: string;
  amount: number;
  is_active: boolean;
  sort_order: number;
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
  updated_at?: string;
};

type StaffProfileRow = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  assigned_lane?: string | null;
  is_active: boolean;
  updated_at?: string;
};

const initialServiceForm = {
  service_code: '',
  service_name: '',
  category: '',
  amount: '0',
  sort_order: '1',
};

const initialCompanyForm = {
  company_code: '',
  company_name: '',
  contact_person: '',
  contact_number: '',
  email_address: '',
  notes: '',
};

const initialStaffForm = {
  email: '',
  password: '',
  full_name: '',
  role: 'nurse',
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
  const [staff, setStaff] = useState<StaffProfileRow[]>([]);
  const [pageError, setPageError] = useState('');
  const [pageNotice, setPageNotice] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [serviceForm, setServiceForm] = useState(initialServiceForm);
  const [companyForm, setCompanyForm] = useState(initialCompanyForm);
  const [staffForm, setStaffForm] = useState(initialStaffForm);
  const [editingService, setEditingService] = useState<ServiceCatalogRow | null>(null);
  const [editingCompany, setEditingCompany] = useState<PartnerCompanyRow | null>(null);
  const [serviceEditForm, setServiceEditForm] = useState(initialServiceForm);
  const [companyEditForm, setCompanyEditForm] = useState(initialCompanyForm);

  const isAdmin = stationRole === 'admin';

  useEffect(() => {
    setStationRole(readStationRole());
  }, []);

  const activeServices = useMemo(() => services.filter((service) => service.is_active), [services]);
  const activeCompanies = useMemo(() => companies.filter((company) => company.is_active), [companies]);
  const activeStaff = useMemo(() => staff.filter((member) => member.is_active), [staff]);

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
        staff?: StaffProfileRow[];
      };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to load admin settings.');
      }

      setServices(payload.services ?? []);
      setCompanies(payload.companies ?? []);
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
    await submitAdminAction(
      {
        kind: 'staff',
        staff: {
          ...staffForm,
          is_active: true,
        },
      },
      'Staff account has been created.'
    );
    setStaffForm(initialStaffForm);
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
          <div className="grid gap-3 sm:grid-cols-3">
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
          <TabsList className="grid h-auto grid-cols-3 gap-2 bg-transparent p-0">
            <TabsTrigger value="services" className="h-11 border">
              <DollarSign className="h-4 w-4" />
              Service Pricing
            </TabsTrigger>
            <TabsTrigger value="companies" className="h-11 border">
              <Building2 className="h-4 w-4" />
              Partner Companies
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
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="service_category">Category</Label>
                      <Input id="service_category" value={serviceForm.category} onChange={(event) => setServiceForm((current) => ({ ...current, category: event.target.value }))} placeholder="Laboratory" required />
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
                          <TableCell colSpan={4} className="text-center text-muted-foreground">
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
                <p className="mt-1 text-sm text-muted-foreground">Overview of staff profiles already registered in the system.</p>
                <div className="mt-5">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Lane</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {staff.map((member) => (
                        <TableRow key={member.id}>
                          <TableCell>
                            <div>
                              <p className="font-semibold">{member.full_name}</p>
                              <p className="text-xs text-muted-foreground">{member.email}</p>
                            </div>
                          </TableCell>
                          <TableCell>{member.role}</TableCell>
                          <TableCell>{member.assigned_lane || 'All / None'}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{member.is_active ? 'Active' : 'Inactive'}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                      {!staff.length && !isLoading && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground">
                            No staff profiles found.
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
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="edit_service_category">Category</Label>
                <Input id="edit_service_category" value={serviceEditForm.category} onChange={(event) => setServiceEditForm((current) => ({ ...current, category: event.target.value }))} required />
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
    </PageLayout>
  );
}
