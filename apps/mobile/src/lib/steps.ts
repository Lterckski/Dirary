/**
 * Today's steps from Android Health Connect, where Samsung Health writes them. Read-only: Dirary asks for
 * permission to read steps and nothing else, and never writes. Needs a development build with the
 * react-native-health-connect module; anywhere else this quietly reports "unavailable".
 */
import { Platform } from 'react-native';

export type StepsState =
  | { kind: 'unavailable' } // not Android, or Health Connect missing
  | { kind: 'needs-permission' }
  | { kind: 'ok'; steps: number };

const READ_STEPS = [{ accessType: 'read' as const, recordType: 'Steps' as const }];

async function client() {
  if (Platform.OS !== 'android') return null;
  try {
    const hc = await import('react-native-health-connect');
    if ((await hc.getSdkStatus()) !== hc.SdkAvailabilityStatus.SDK_AVAILABLE) return null;
    if (!(await hc.initialize())) return null;
    return hc;
  } catch {
    return null;
  }
}

/** Steps since midnight, or why there aren't any. */
export async function todaysSteps(): Promise<StepsState> {
  const hc = await client();
  if (!hc) return { kind: 'unavailable' };
  try {
    const granted = await hc.getGrantedPermissions();
    if (!granted.some((p) => 'recordType' in p && p.recordType === 'Steps' && p.accessType === 'read')) return { kind: 'needs-permission' };
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const result = await hc.aggregateRecord({ recordType: 'Steps', timeRangeFilter: { operator: 'between', startTime: start.toISOString(), endTime: new Date().toISOString() } });
    return { kind: 'ok', steps: result.COUNT_TOTAL ?? 0 };
  } catch {
    return { kind: 'needs-permission' };
  }
}

/** Shows Health Connect's own permission screen for reading steps. */
export async function askForSteps(): Promise<StepsState> {
  const hc = await client();
  if (!hc) return { kind: 'unavailable' };
  try {
    await hc.requestPermission(READ_STEPS);
  } catch {
    // The user closed it; todaysSteps reports what was granted.
  }
  return todaysSteps();
}
