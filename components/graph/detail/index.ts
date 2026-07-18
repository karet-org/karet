// Barrel exports for the structural node editors.

export {
  SourceContainerEditor,
  SOURCE_CONTAINER_EDITOR_ERROR_TESTID,
} from "./SourceContainerEditor";
export type { SourceContainerEditorProps } from "./SourceContainerEditor";
export {
  MappingEditor,
  AST_JSON_PARSE_ERROR_TESTID,
  MAPPING_COLUMN_EDITOR_TESTID,
} from "./MappingEditor";
export type { MappingEditorProps } from "./MappingEditor";
export {
  LookupMappingEditor,
  LOOKUP_MAPPING_EDITOR_ERROR_TESTID,
} from "./LookupMappingEditor";
export type { LookupMappingEditorProps } from "./LookupMappingEditor";
export {
  AnalyticTableEditor,
  ANALYTIC_TABLE_EDITOR_ERROR_TESTID,
} from "./AnalyticTableEditor";
export type { AnalyticTableEditorProps } from "./AnalyticTableEditor";
export {
  validateSourceContainer,
  validateLookupMapping,
  validateMapping,
  KNOWN_COLUMN_TYPES,
  isKnownColumnType,
} from "./validation";
export type {
  ValidationResult,
  KnownColumnType,
} from "./validation";
