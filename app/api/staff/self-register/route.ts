import { NextResponse } from 'next/server';
import { getDefaultActionPermissions } from '@/lib/action-permissions';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getDefaultAllowedModules } from '@/lib/staff-modules';
import { mapDbRoleToStationRole } from '@/lib/station-role';

type StaffRoleDb =
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

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
      fullName?: string;
      role?: StaffRoleDb;
    };

    if (!body.email || !body.password || !body.fullName || !body.role) {
      return NextResponse.json({ error: 'Missing staff registration fields.' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const stationRole = mapDbRoleToStationRole(body.role);
    const allowedModules = stationRole ? getDefaultAllowedModules(stationRole) : ['/dashboard'];
    const actionPermissions = stationRole ? getDefaultActionPermissions(stationRole) : [];

    const { data: createdUser, error: createUserError } = await supabase.auth.admin.createUser({
      email: body.email.trim(),
      password: body.password,
      email_confirm: true,
    });

    if (createUserError || !createdUser.user) {
      throw new Error(createUserError?.message ?? 'Unable to create staff account.');
    }

    const { error: profileError } = await supabase.from('staff_profiles').insert({
      id: createdUser.user.id,
      email: body.email.trim(),
      full_name: body.fullName.trim(),
      role: body.role,
      assigned_lane: toAssignedLane(body.role),
      is_active: false,
      allowed_modules: allowedModules,
      action_permissions: actionPermissions,
    });

    if (profileError) {
      throw new Error(profileError.message);
    }

    return NextResponse.json({
      success: true,
      message: 'Staff account request submitted. Wait for admin activation before signing in.',
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unable to submit staff registration.',
      },
      { status: 500 }
    );
  }
}
