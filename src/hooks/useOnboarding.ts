export type Gender = 'male' | 'female' | 'other';
export type RelationshipType = 'serious' | 'casual' | 'longTerm';

export const ONBOARDING_STEPS = [
  'name',
  'city',
  'gender',
  'dating-preference',
  'relationship-type',
  'about',
  'photos',
  'birthday',
] as const;

export const TOTAL_STEPS = ONBOARDING_STEPS.length;
