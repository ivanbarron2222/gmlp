import { NextResponse } from 'next/server';
import { getDefaultActionPermissions, sanitizeActionPermissions } from '@/lib/action-permissions';
import { requireAdminStaffAccess } from '@/lib/supabase/admin-auth';
import { getDefaultAllowedModules, sanitizeAllowedModules } from '@/lib/staff-modules';
import { mapDbRoleToStationRole } from '@/lib/station-role';

type StaffRoleDb =
  | 'admin'
  | 'nurse'
  | 'blood_test'
  | 'drug_test'
  | 'doctor'
  | 'xray'
  | 'ecg'
  | 'encoder'
  | 'cashier'
  | 'pathologist';

type DoctorRow = {
  id?: string;
  full_name: string;
  is_active?: boolean;
};

function toAssignedLane(role: StaffRoleDb) {
  switch (role) {
    case 'blood_test':
    case 'drug_test':
    case 'doctor':
    case 'xray':
    case 'ecg':
      return role;
    default:
      return null;
  }
}

function isMissingPackageAmountColumn(error: unknown) {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const maybeError = error as { code?: string; message?: string; details?: string };
  const message = `${maybeError.message ?? ''} ${maybeError.details ?? ''}`.toLowerCase();

  return (
    (maybeError.code === '42703' || maybeError.code === 'PGRST204') &&
    message.includes('amount')
  );
}

function parsePartnerPackageAmount(packageRow: { amount?: number | string | null; notes?: string | null }) {
  const directAmount = Number(packageRow.amount ?? Number.NaN);
  if (Number.isFinite(directAmount)) {
    return directAmount;
  }

  const notes = String(packageRow.notes ?? '');
  const match = /partner\s+rate:\s*([0-9]+(?:\.[0-9]+)?)/i.exec(notes);
  if (!match) {
    return 0;
  }

  const parsedAmount = Number(match[1]);
  return Number.isFinite(parsedAmount) ? parsedAmount : 0;
}

export async function GET(request: Request) {
  try {
    const { supabase } = await requireAdminStaffAccess(request);

    const [
      { data: services, error: servicesError },
      { data: companies, error: companiesError },
      { data: doctors, error: doctorsError },
      { data: staff, error: staffError },
      { data: inventory, error: inventoryError },
      { data: retentionPolicies, error: retentionError },
      { count: reportRevisionCount, error: revisionsError },
      { data: notifications, error: notificationsError },
      { data: exceptions, error: exceptionsError },
      { data: appointments, error: appointmentsError },
    ] = await Promise.all([
      supabase
        .from('service_catalog')
        .select('id, service_code, service_name, category, amount, is_active, sort_order, service_lane, updated_at')
        .order('sort_order', { ascending: true })
        .order('service_name', { ascending: true }),
      supabase
        .from('partner_companies')
        .select('id, company_code, company_name, contact_person, contact_number, email_address, notes, is_active, updated_at')
        .order('company_name', { ascending: true }),
      supabase
        .from('doctors')
        .select('id, full_name, is_active, created_at, updated_at')
        .order('full_name', { ascending: true }),
      supabase
        .from('staff_profiles')
        .select('id, email, full_name, role, assigned_lane, is_active, updated_at, allowed_modules, action_permissions')
        .order('full_name', { ascending: true }),
      supabase
        .from('inventory_items')
        .select('id, item_code, item_name, unit, linked_lane, reorder_threshold, on_hand_quantity, is_active, updated_at')
        .order('item_name', { ascending: true }),
      supabase
        .from('retention_policies')
        .select('id, policy_code, entity_type, retention_days, archive_enabled, protected_delete, notes, updated_at')
        .order('policy_code', { ascending: true }),
      supabase.from('report_revisions').select('id', { count: 'exact', head: true }),
      supabase
        .from('notification_events')
        .select('id, status', { count: 'exact' })
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('audit_events')
        .select('id, event_type', { count: 'exact' })
        .in('event_type', ['visit_reopened', 'payment_voided', 'payment_refunded', 'queue_overridden', 'patient_merged', 'specimen_recollect_requested', 'patient_corrected']),
      supabase
        .from('appointments')
        .select('id, status', { count: 'exact' })
        .in('status', ['scheduled']),
    ]);

    if (servicesError) throw new Error(servicesError.message);
    if (companiesError) throw new Error(companiesError.message);
    if (doctorsError) throw new Error(doctorsError.message);
    if (staffError) throw new Error(staffError.message);
    if (inventoryError) throw new Error(inventoryError.message);
    if (retentionError) throw new Error(retentionError.message);
    if (revisionsError) throw new Error(revisionsError.message);
    if (notificationsError) throw new Error(notificationsError.message);
    if (exceptionsError) throw new Error(exceptionsError.message);
    if (appointmentsError) throw new Error(appointmentsError.message);

    let packageAmountsAvailable = true;
    let companyPackages: Array<{
      company_id?: string | null;
      package_code?: string | null;
      service_codes?: string[] | null;
      amount?: number | string | null;
      notes?: string | null;
    }> = [];
    const { data: packageRows, error: packageRowsError } = await supabase
      .from('partner_company_packages')
      .select('id, company_id, package_code, package_name, amount, notes, is_active, service_codes, created_at, updated_at')
      .order('package_name', { ascending: true });

    if (packageRowsError) {
      if (!isMissingPackageAmountColumn(packageRowsError)) {
        throw new Error(packageRowsError.message);
      }

      packageAmountsAvailable = false;
      const { data: fallbackPackageRows, error: fallbackPackageRowsError } = await supabase
        .from('partner_company_packages')
        .select('id, company_id, package_code, package_name, notes, is_active, service_codes, created_at, updated_at')
        .order('package_name', { ascending: true });

      if (fallbackPackageRowsError) {
        throw new Error(fallbackPackageRowsError.message);
      }

      companyPackages = fallbackPackageRows ?? [];
    } else {
      companyPackages = packageRows ?? [];
    }

    const serviceRows = services ?? [];
    const packagePriceByCompanyId = new Map<
      string,
      {
        preEmploymentAmount: number;
        checkUpAmount: number;
        labAmount: number;
        preEmploymentServiceCodes: string[];
        checkUpServiceCodes: string[];
        labServiceCodes: string[];
      }
    >();

    for (const packageRow of companyPackages ?? []) {
      const companyId = String(packageRow.company_id ?? '');
      if (!companyId) {
        continue;
      }

      const current = packagePriceByCompanyId.get(companyId) ?? {
        preEmploymentAmount: 0,
        checkUpAmount: 0,
        labAmount: 0,
        preEmploymentServiceCodes: [] as string[],
        checkUpServiceCodes: [] as string[],
        labServiceCodes: [] as string[],
      };
      if (packageRow.package_code === 'pre-employment') {
        current.preEmploymentAmount = parsePartnerPackageAmount(packageRow);
        current.preEmploymentServiceCodes = packageRow.service_codes ?? [];
      } else if (packageRow.package_code === 'check-up') {
        current.checkUpAmount = parsePartnerPackageAmount(packageRow);
        current.checkUpServiceCodes = packageRow.service_codes ?? [];
      } else if (packageRow.package_code === 'lab') {
        current.labAmount = parsePartnerPackageAmount(packageRow);
        current.labServiceCodes = packageRow.service_codes ?? [];
      }

      packagePriceByCompanyId.set(companyId, current);
    }

    return NextResponse.json({
      services: serviceRows,
      companies: (companies ?? []).map((company) => ({
        ...company,
        ...(packagePriceByCompanyId.get(String(company.id)) ?? {
          preEmploymentAmount: 0,
          checkUpAmount: 0,
          labAmount: 0,
          preEmploymentServiceCodes: [],
          checkUpServiceCodes: [],
          labServiceCodes: [],
        }),
      })),
      doctors: doctors ?? [],
      staff: staff ?? [],
      inventory: inventory ?? [],
      retentionPolicies: retentionPolicies ?? [],
      packageAmountsAvailable,
      healthSummary: {
        reportRevisionCount: reportRevisionCount ?? 0,
        undeliveredNotificationCount: (notifications ?? []).filter((item) => item.status !== 'sent').length,
        exceptionEventCount: exceptions?.length ?? 0,
        overdueAppointmentCount: appointments?.length ?? 0,
        lowInventoryCount: (inventory ?? []).filter(
          (item) => Number(item.on_hand_quantity ?? 0) <= Number(item.reorder_threshold ?? 0)
        ).length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load admin settings.';
    const status = message === 'Admin access required.' || message === 'Missing authorization token.' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, userId } = await requireAdminStaffAccess(request);
    const body = (await request.json()) as
      | {
          kind: 'service';
          service?: {
            id?: string;
            service_code: string;
            service_name: string;
            category: string;
            amount: number;
            sort_order?: number;
            service_lane?: string | null;
            is_active?: boolean;
          };
        }
      | {
          kind: 'company';
          company?: {
            id?: string;
            company_code: string;
            company_name: string;
            contact_person?: string;
            contact_number?: string;
            email_address?: string;
            notes?: string;
            is_active?: boolean;
            pre_employment_amount?: number;
            check_up_amount?: number;
            lab_amount?: number;
            pre_employment_service_codes?: string[];
            lab_service_codes?: string[];
          };
        }
      | {
          kind: 'doctor';
          doctor?: DoctorRow;
        }
      | {
          kind: 'staff';
          staff?: {
            email: string;
            password: string;
            full_name: string;
            role: StaffRoleDb;
            is_active?: boolean;
            allowed_modules?: string[];
            action_permissions?: string[];
            assigned_lane?: string | null;
            id?: string;
          };
        }
      | {
          kind: 'inventory';
          inventory?: {
            id?: string;
            item_code: string;
            item_name: string;
            unit: string;
            linked_lane?: string | null;
            reorder_threshold?: number;
            on_hand_quantity?: number;
            notes?: string;
            is_active?: boolean;
          };
        }
      | {
          kind: 'retention';
          retention?: {
            id?: string;
            policy_code: string;
            entity_type: string;
            retention_days: number;
            archive_enabled?: boolean;
            protected_delete?: boolean;
            notes?: string;
          };
        };

    if (body.kind === 'service') {
      const service = body.service;
      if (!service?.service_code || !service.service_name || !service.category) {
        return NextResponse.json({ error: 'Missing service fields.' }, { status: 400 });
      }

      const payload = {
        service_code: service.service_code.trim(),
        service_name: service.service_name.trim(),
        category: service.category.trim(),
        amount: Number(service.amount ?? 0),
        sort_order: Number(service.sort_order ?? 1),
        service_lane: service.service_lane?.trim() || null,
        is_active: service.is_active ?? true,
      };

      const query = service.id
        ? supabase.from('service_catalog').update(payload).eq('id', service.id).select().single()
        : supabase.from('service_catalog').insert(payload).select().single();

      const { data, error } = await query;
      if (error) throw new Error(error.message);

      return NextResponse.json({ service: data });
    }

    if (body.kind === 'company') {
      const company = body.company;
      if (!company?.company_code || !company.company_name) {
        return NextResponse.json({ error: 'Missing company fields.' }, { status: 400 });
      }

      const payload = {
        company_code: company.company_code.trim(),
        company_name: company.company_name.trim(),
        contact_person: company.contact_person?.trim() || null,
        contact_number: company.contact_number?.trim() || null,
        email_address: company.email_address?.trim() || null,
        notes: company.notes?.trim() || null,
        is_active: company.is_active ?? true,
      };

      const query = company.id
        ? supabase.from('partner_companies').update(payload).eq('id', company.id).select().single()
        : supabase.from('partner_companies').insert(payload).select().single();

      const { data, error } = await query;
      if (error) throw new Error(error.message);

      const nextCompanyId = String(data.id);
      const buildPackageServiceCodes = (packageCode: 'pre-employment' | 'check-up' | 'lab') => {
        if (packageCode === 'pre-employment') {
          return company.pre_employment_service_codes?.length
            ? company.pre_employment_service_codes
            : ['svc-blood-test', 'svc-drug-test', 'svc-xray'];
        }
        if (packageCode === 'check-up') {
          return ['svc-checkup'];
        }
        return company.lab_service_codes?.length ? company.lab_service_codes : ['svc-blood-test'];
      };

      const packagePayloads = [
        {
          company_id: nextCompanyId,
          package_code: 'pre-employment',
          package_name: 'Pre-Employment',
          amount: Number(company.pre_employment_amount ?? 0),
          notes: `Partner rate: ${Number(company.pre_employment_amount ?? 0).toFixed(2)}`,
          service_codes: buildPackageServiceCodes('pre-employment'),
          is_active: true,
        },
        {
          company_id: nextCompanyId,
          package_code: 'check-up',
          package_name: 'Check-Up',
          amount: Number(company.check_up_amount ?? 0),
          notes: `Partner rate: ${Number(company.check_up_amount ?? 0).toFixed(2)}`,
          service_codes: buildPackageServiceCodes('check-up'),
          is_active: true,
        },
        {
          company_id: nextCompanyId,
          package_code: 'lab',
          package_name: 'Lab',
          amount: Number(company.lab_amount ?? 0),
          notes: `Partner rate: ${Number(company.lab_amount ?? 0).toFixed(2)}`,
          service_codes: buildPackageServiceCodes('lab'),
          is_active: true,
        },
      ];

      const { error: packagesError } = await supabase
        .from('partner_company_packages')
        .upsert(packagePayloads, { onConflict: 'company_id,package_code' });

      if (packagesError) {
        if (!isMissingPackageAmountColumn(packagesError)) {
          throw new Error(packagesError.message);
        }

        const legacyPackagePayloads = packagePayloads.map(({ amount, ...packagePayload }) => packagePayload);
        const { error: legacyPackagesError } = await supabase
          .from('partner_company_packages')
          .upsert(legacyPackagePayloads, { onConflict: 'company_id,package_code' });

        if (legacyPackagesError) {
          throw new Error(legacyPackagesError.message);
        }
      }

      return NextResponse.json({
        company: {
          ...data,
          preEmploymentAmount: Number(company.pre_employment_amount ?? 0),
          checkUpAmount: Number(company.check_up_amount ?? 0),
          labAmount: Number(company.lab_amount ?? 0),
          preEmploymentServiceCodes: buildPackageServiceCodes('pre-employment'),
          labServiceCodes: buildPackageServiceCodes('lab'),
        },
      });
    }

    if (body.kind === 'doctor') {
      const doctor = body.doctor;
      if (!doctor?.full_name?.trim()) {
        return NextResponse.json({ error: 'Missing doctor name.' }, { status: 400 });
      }

      const payload = {
        full_name: doctor.full_name.trim(),
        is_active: doctor.is_active ?? true,
      };

      const query = doctor.id
        ? supabase.from('doctors').update(payload).eq('id', doctor.id).select().single()
        : supabase.from('doctors').insert(payload).select().single();

      const { data, error } = await query;
      if (error) throw new Error(error.message);

      return NextResponse.json({ doctor: data });
    }

    if (body.kind === 'inventory') {
      const inventory = body.inventory;
      if (!inventory?.item_code || !inventory.item_name || !inventory.unit) {
        return NextResponse.json({ error: 'Missing inventory fields.' }, { status: 400 });
      }

      const payload = {
        item_code: inventory.item_code.trim(),
        item_name: inventory.item_name.trim(),
        unit: inventory.unit.trim(),
        linked_lane: inventory.linked_lane?.trim() || null,
        reorder_threshold: Number(inventory.reorder_threshold ?? 0),
        on_hand_quantity: Number(inventory.on_hand_quantity ?? 0),
        notes: inventory.notes?.trim() || null,
        is_active: inventory.is_active ?? true,
        created_by: userId,
      };

      const query = inventory.id
        ? supabase.from('inventory_items').update(payload).eq('id', inventory.id).select().single()
        : supabase.from('inventory_items').insert(payload).select().single();

      const { data, error } = await query;
      if (error) throw new Error(error.message);

      return NextResponse.json({ inventory: data });
    }

    if (body.kind === 'retention') {
      const retention = body.retention;
      if (!retention?.policy_code || !retention.entity_type) {
        return NextResponse.json({ error: 'Missing retention fields.' }, { status: 400 });
      }

      const payload = {
        policy_code: retention.policy_code.trim(),
        entity_type: retention.entity_type.trim(),
        retention_days: Number(retention.retention_days ?? 0),
        archive_enabled: retention.archive_enabled ?? true,
        protected_delete: retention.protected_delete ?? true,
        notes: retention.notes?.trim() || null,
        updated_by: userId,
      };

      const query = retention.id
        ? supabase.from('retention_policies').update(payload).eq('id', retention.id).select().single()
        : supabase.from('retention_policies').insert(payload).select().single();

      const { data, error } = await query;
      if (error) throw new Error(error.message);

      return NextResponse.json({ retention: data });
    }

    if (body.kind === 'staff') {
      const staff = body.staff;
      if (!staff?.role || !staff.full_name || (!staff.id && (!staff.email || !staff.password))) {
        return NextResponse.json({ error: 'Missing staff account fields.' }, { status: 400 });
      }

      const stationRole = mapDbRoleToStationRole(staff.role);
      const defaultModules = stationRole ? getDefaultAllowedModules(stationRole) : [];
      const defaultPermissions = stationRole ? getDefaultActionPermissions(stationRole) : [];
      const allowedModules = sanitizeAllowedModules(staff.allowed_modules ?? defaultModules);
      const actionPermissions = sanitizeActionPermissions(staff.action_permissions ?? defaultPermissions);

      if (staff.id) {
        const { data: profile, error: profileError } = await supabase
          .from('staff_profiles')
          .update({
            full_name: staff.full_name.trim(),
            role: staff.role,
            assigned_lane: staff.assigned_lane ?? toAssignedLane(staff.role),
            is_active: staff.is_active ?? true,
            allowed_modules: allowedModules,
            action_permissions: actionPermissions,
          })
          .eq('id', staff.id)
          .select()
          .single();

        if (profileError) {
          throw new Error(profileError.message);
        }

        return NextResponse.json({ staff: profile });
      }

      const { data: createdUser, error: createUserError } = await supabase.auth.admin.createUser({
        email: staff.email.trim(),
        password: staff.password,
        email_confirm: true,
      });

      if (createUserError || !createdUser.user) {
        throw new Error(createUserError?.message ?? 'Unable to create user account.');
      }

      const { data: profile, error: profileError } = await supabase
        .from('staff_profiles')
        .insert({
          id: createdUser.user.id,
          email: staff.email.trim(),
          full_name: staff.full_name.trim(),
          role: staff.role,
          assigned_lane: staff.assigned_lane ?? toAssignedLane(staff.role),
          is_active: staff.is_active ?? true,
          allowed_modules: allowedModules,
          action_permissions: actionPermissions,
        })
        .select()
        .single();

      if (profileError) {
        throw new Error(profileError.message);
      }

      return NextResponse.json({ staff: profile });
    }

    return NextResponse.json({ error: 'Unsupported settings action.' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save admin settings.';
    const status = message === 'Admin access required.' || message === 'Missing authorization token.' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
