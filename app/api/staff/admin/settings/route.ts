import { NextResponse } from 'next/server';
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

export async function GET(request: Request) {
  try {
    const { supabase } = await requireAdminStaffAccess(request);

    const [{ data: services, error: servicesError }, { data: companies, error: companiesError }, { data: staff, error: staffError }] = await Promise.all([
      supabase
        .from('service_catalog')
        .select('id, service_code, service_name, category, amount, is_active, sort_order, updated_at')
        .order('sort_order', { ascending: true })
        .order('service_name', { ascending: true }),
      supabase
        .from('partner_companies')
        .select('id, company_code, company_name, contact_person, contact_number, email_address, notes, is_active, updated_at')
        .order('company_name', { ascending: true }),
      supabase
        .from('staff_profiles')
        .select('id, email, full_name, role, assigned_lane, is_active, updated_at, allowed_modules')
        .order('full_name', { ascending: true }),
    ]);

    if (servicesError) throw new Error(servicesError.message);
    if (companiesError) throw new Error(companiesError.message);
    if (staffError) throw new Error(staffError.message);

    return NextResponse.json({
      services: services ?? [],
      companies: companies ?? [],
      staff: staff ?? [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load admin settings.';
    const status = message === 'Admin access required.' || message === 'Missing authorization token.' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const { supabase } = await requireAdminStaffAccess(request);
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
          };
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
            assigned_lane?: string | null;
            id?: string;
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

      return NextResponse.json({ company: data });
    }

    if (body.kind === 'staff') {
      const staff = body.staff;
      if (!staff?.role || !staff.full_name || (!staff.id && (!staff.email || !staff.password))) {
        return NextResponse.json({ error: 'Missing staff account fields.' }, { status: 400 });
      }

      const stationRole = mapDbRoleToStationRole(staff.role);
      const defaultModules = stationRole ? getDefaultAllowedModules(stationRole) : [];
      const allowedModules = sanitizeAllowedModules(staff.allowed_modules ?? defaultModules);

      if (staff.id) {
        const { data: profile, error: profileError } = await supabase
          .from('staff_profiles')
          .update({
            full_name: staff.full_name.trim(),
            role: staff.role,
            assigned_lane: staff.assigned_lane ?? toAssignedLane(staff.role),
            is_active: staff.is_active ?? true,
            allowed_modules: allowedModules,
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
