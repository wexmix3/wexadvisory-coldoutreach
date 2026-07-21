import { XMLParser } from 'fast-xml-parser';
import JSZip from 'jszip';
import { gunzipSync } from 'zlib';

export type DmarcRecordRow = {
  report_id: string;
  org_name: string | null;
  header_from: string | null;
  source_ip: string;
  message_count: number;
  disposition: string;
  dkim_result: string | null;
  spf_result: string | null;
  begin_date: string; // ISO
  end_date: string; // ISO
};

const parser = new XMLParser({ ignoreAttributes: false });

// A DMARC report email attaches either a .gz (raw gzip of the XML) or a
// .zip (containing one XML file). Google sends .zip; some other senders
// use .gz directly.
async function extractXml(filename: string, content: Buffer): Promise<string> {
  if (/\.gz$/i.test(filename)) {
    return gunzipSync(content).toString('utf-8');
  }
  if (/\.zip$/i.test(filename)) {
    const zip = await JSZip.loadAsync(content);
    const xmlEntry = Object.values(zip.files).find((f) => /\.xml$/i.test(f.name));
    if (!xmlEntry) throw new Error(`No XML file found inside ${filename}`);
    return xmlEntry.async('string');
  }
  return content.toString('utf-8');
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

type DmarcXmlRecord = {
  identifiers?: { header_from?: string };
  row?: {
    source_ip?: string;
    count?: number;
    policy_evaluated?: { disposition?: string; dkim?: string; spf?: string };
  };
};

export async function parseDmarcReport(filename: string, content: Buffer): Promise<DmarcRecordRow[]> {
  const xml = await extractXml(filename, content);
  const doc = parser.parse(xml);

  const feedback = doc.feedback;
  if (!feedback) throw new Error(`${filename}: not a DMARC aggregate report (no <feedback> root)`);

  const reportId = String(feedback.report_metadata?.report_id ?? filename);
  const orgName = feedback.report_metadata?.org_name ?? null;
  const beginEpoch = Number(feedback.report_metadata?.date_range?.begin);
  const endEpoch = Number(feedback.report_metadata?.date_range?.end);
  const beginDate = new Date(beginEpoch * 1000).toISOString();
  const endDate = new Date(endEpoch * 1000).toISOString();

  const records = asArray<DmarcXmlRecord>(feedback.record);

  return records.map((record) => ({
    report_id: reportId,
    org_name: orgName,
    header_from: record.identifiers?.header_from ?? null,
    source_ip: String(record.row?.source_ip ?? 'unknown'),
    message_count: Number(record.row?.count ?? 0),
    disposition: String(record.row?.policy_evaluated?.disposition ?? 'unknown'),
    dkim_result: record.row?.policy_evaluated?.dkim ?? null,
    spf_result: record.row?.policy_evaluated?.spf ?? null,
    begin_date: beginDate,
    end_date: endDate,
  }));
}
