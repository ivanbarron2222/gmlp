import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('partner_companies')
      .select('id, company_name')
      .eq('is_active', true)
      .order('company_name', { ascending: true });

    if (error) {
      throw error;
    }

    const companyIds = (data ?? []).map((row) => String(row.id));
    const { data: packages, error: packagesError } = await supabase
      .from('partner_company_packages')
      .select('company_id, package_code, service_codes')
      .eq('is_active', true)
      .in('company_id', companyIds.length > 0 ? companyIds : ['00000000-0000-0000-0000-000000000000']);

    if (packagesError) {
      throw packagesError;
    }

    const requirementsByCompanyId = new Map<string, Record<string, string[]>>();
    for (const packageRow of packages ?? []) {
      const companyId = String(packageRow.company_id ?? '');
      const packageCode = String(packageRow.package_code ?? '');
      if (!companyId || !packageCode) {
        continue;
      }

      const current = requirementsByCompanyId.get(companyId) ?? {};
      current[packageCode] = Array.isArray(packageRow.service_codes)
        ? packageRow.service_codes.map((code) => String(code))
        : [];
      requirementsByCompanyId.set(companyId, current);
    }

    return NextResponse.json({
      companies: (data ?? []).map((row) => ({
        id: String(row.id),
        companyName: String(row.company_name ?? ''),
        requirements: requirementsByCompanyId.get(String(row.id)) ?? {},
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unable to load partner companies.',
      },
      { status: 500 }
    );
  }
}
