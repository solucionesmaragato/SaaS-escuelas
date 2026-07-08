export type EntityNavigateTarget = {
  to: string;
  search?: Record<string, string | undefined>;
};

export type OnNavigateToEntity = (target: EntityNavigateTarget) => void;
