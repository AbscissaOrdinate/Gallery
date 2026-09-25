/** Shared primitives from the design book (docs/STYLE.md §5). Every screen builds from these. */
export { Panel, Group, Row, Value, Empty } from "./Panel";
export { Button, TextField, NumberField, Select, TextArea, Checkbox, FieldMessage } from "./Controls";
export type { ButtonVariant, ControlSize } from "./Controls";
export { PrimaryTabs, PanelTabs, Segmented } from "./Tabs";
export type { TabItem } from "./Tabs";
export { Pip, PipLabel, StatusBadge, StatusRow, AdvisoryList, advisoryId } from "./Status";
export { AsciiBar, AsciiMeter, Spinner, IndeterminateBar } from "./Ascii";
export { caps, commitState, countBySeverity, groupBySeverity, uiSeverity, ratioSeverity, SEVERITY_WORD, treePrefix } from "./severity";
export type { UiSeverity } from "./severity";
export { cx } from "./cx";
