export type { ModulePlan } from "../contracts/planning.js";

export interface PlannedModule {
  name: string;
  description: string;
  components: string[];
  parentModule?: string;
}
