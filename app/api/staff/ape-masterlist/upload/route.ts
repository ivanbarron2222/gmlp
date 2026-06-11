import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { requireAdminStaffAccess } from '@/lib/supabase/admin-auth';
import { buildLabOrderNumber, normalizeMasterlistRows } from '@/lib/ape-masterlist';

export async function POST(request: Request) {
  try {
    const { supabase, userId } = await requireAdminStaffAccess(request);
    const formData = await request.formData();
    const file = formData.get('file');
    const apeEventId = String(formData.get('apeEventId') ?? '');
    const companyName = String(formData.get('companyName') ?? '').trim();

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Excel file is required.' }, { status: 400 });
    }
    if (!apeEventId || !companyName) {
      return NextResponse.json({ error: 'APE event and company name are required.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return NextResponse.json({ error: 'Excel file has no worksheet.' }, { status: 400 });
    }

    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    const patients = normalizeMasterlistRows(rawRows);

    if (patients.length === 0) {
      return NextResponse.json({ error: 'No valid patient rows found. Include first name and last name columns.' }, { status: 400 });
    }

    const { data: batch, error: batchError } = await supabase
      .from('ape_masterlist_batches')
      .upsert(
        {
          ape_event_id: apeEventId,
          company_name: companyName,
          source_filename: file.name,
          total_patients: patients.length,
          generated_lab_orders: patients.length,
          uploaded_by: userId,
        },
        { onConflict: 'ape_event_id,company_name' }
      )
      .select()
      .single();

    if (batchError) {
      throw new Error(batchError.message);
    }

    const batchId = String(batch.id);

    await Promise.all([
      supabase.from('ape_masterlist_patients').delete().eq('batch_id', batchId),
      supabase.from('ape_lab_order_pool').delete().eq('batch_id', batchId),
    ]);

    const { error: patientsError } = await supabase.from('ape_masterlist_patients').insert(
      patients.map((patient) => ({
        batch_id: batchId,
        ape_event_id: apeEventId,
        company_name: companyName,
        row_number: patient.rowNumber,
        first_name: patient.firstName,
        middle_name: patient.middleName || null,
        last_name: patient.lastName,
        birth_date: patient.birthDate,
        age: patient.age || null,
        gender: patient.gender || null,
        department: patient.department || null,
        contact_number: patient.contactNumber || null,
        email_address: patient.emailAddress || null,
        raw_payload: patient.rawPayload,
      }))
    );

    if (patientsError) {
      throw new Error(patientsError.message);
    }

    const { error: ordersError } = await supabase.from('ape_lab_order_pool').insert(
      Array.from({ length: patients.length }, (_, index) => ({
        batch_id: batchId,
        ape_event_id: apeEventId,
        company_name: companyName,
        lab_order_number: buildLabOrderNumber(index + 1),
        sequence_number: index + 1,
        status: 'available',
      }))
    );

    if (ordersError) {
      throw new Error(ordersError.message);
    }

    return NextResponse.json({
      batch: {
        id: batchId,
        companyName,
        totalPatients: patients.length,
        generatedLabOrders: patients.length,
        firstLabOrder: buildLabOrderNumber(1),
        lastLabOrder: buildLabOrderNumber(patients.length),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to upload APE masterlist.' },
      { status: 500 }
    );
  }
}
