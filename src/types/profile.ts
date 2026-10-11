export interface Profile {
  id: string; name: string; age: number; coverPhoto: string;
  bioEnabled: boolean; bioCards?: string[]; specialization?: string; experienceTags?: string[]; coverFallback: string;
  narrative: { summary: { fallback: string; byStrength: Record<string, string> }; strengths: Record<string, string>; potential: Record<string, string>; blindSpot: Record<string, string>; risks: Record<string, string>; projectRole: Record<string, string>; trustSituations: Record<string, string>; neutralPotential: string; neutralRisk: string; neutralBlindSpot: string; noProject: string; noCall: string };
  journey?: { label: string; title: string; text: string; closing?: string }[];
  relationshipOptions: string[]; strengthOptions: string[]; potentialOptions: string[];
  blindSpotOptions: string[]; riskOptions: string[]; projectRoleOptions: string[];
  trustSituationOptions: string[]; finalOpenQuestion: string;
}
export interface ResponseState {
  familiarityScore: number; relationship: string; relationshipOther: string;
  strengths: string[]; potential: string[]; blindSpot: string; blindSpotOther: string;
  risks: string[]; riskOther: string; projectRole: string; trustScore: number;
  trustSituations: string[]; openAnswer: string; startedAt: string | null;
  completedAt: string | null; createMirrorInterest: boolean;
}
export interface Draft { version: 2; screen: number; journeyIndex: number; rewardOpened: boolean; response: ResponseState }
export const emptyResponse = (): ResponseState => ({ familiarityScore: 5, relationship: '', relationshipOther: '', strengths: [], potential: [], blindSpot: '', blindSpotOther: '', risks: [], riskOther: '', projectRole: '', trustScore: 5, trustSituations: [], openAnswer: '', startedAt: null, completedAt: null, createMirrorInterest: false })
