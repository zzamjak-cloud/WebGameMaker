export {
  catalogSearch,
  type CatalogHit,
} from "./catalog.js";
export {
  createGameProject,
  type CreateGameOptions,
} from "./create-game.js";
export {
  REQUIRED_DESIGN_SECTIONS,
  collectDesignSectionIssues,
  loadDesignDocument,
  parseDesignFrontMatter,
  searchDesigns,
  validateDesignLibrary,
  type DesignCatalogEntry,
  type DesignDocument,
  type DesignFrontMatter,
  type DesignIssue,
} from "./designs.js";
export {
  loadProjectBundle,
  validateProjectPath,
  type ProjectValidationIssue,
  type ProjectValidationResult,
} from "./validate.js";
