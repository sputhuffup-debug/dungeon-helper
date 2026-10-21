import { SelectField, MultiSelectField, TagsField } from "./choice";
import { ComputedField } from "./computed";
import { ConditionsField } from "./conditions";
import { DicePoolField } from "./dicepool";
import { EntriesField } from "./entries";
import { GearField } from "./gear";
import { ImageField, ZoneMapField } from "./media";
import { AttributeField, CheckboxField, NumberField } from "./number";
import { SupplyField, StressField } from "./pips";
import { RefField, RefListField } from "./ref";
import { registerWidget } from "./registry";
import { SkillsField } from "./skills";
import { ListField, ObjectField, StatBlockField, TableField } from "./structured";
import { TalentsField } from "./talents";
import { TextAreaField, TextField } from "./text";

/** Register the built-in widgets. Runs once on import. */
export function registerDefaultWidgets(): void {
  registerWidget("text", TextField);
  registerWidget("textarea", TextAreaField);
  registerWidget("richtext", TextAreaField);
  registerWidget("number", NumberField);
  registerWidget("checkbox", CheckboxField);
  registerWidget("select", SelectField);
  registerWidget("multiselect", MultiSelectField);
  registerWidget("tags", TagsField);
  registerWidget("attribute", AttributeField);
  registerWidget("skill", NumberField);
  registerWidget("skills", SkillsField);
  registerWidget("talents", TalentsField);
  registerWidget("conditions", ConditionsField);
  registerWidget("gear", GearField);
  registerWidget("dicepool", DicePoolField);
  registerWidget("supply", SupplyField);
  registerWidget("stress", StressField);
  registerWidget("computed", ComputedField);
  registerWidget("ref", RefField);
  registerWidget("reflist", RefListField);
  registerWidget("statblock", StatBlockField);
  registerWidget("table", TableField);
  registerWidget("list", ListField);
  registerWidget("entries", EntriesField);
  registerWidget("object", ObjectField);
  registerWidget("image", ImageField);
  registerWidget("zonemap", ZoneMapField);
}

registerDefaultWidgets();
