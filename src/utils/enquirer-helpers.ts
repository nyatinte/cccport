// enquirer has no @types package — cast through unknown to avoid polluting callers with `any`
import Enquirer from "enquirer";

export async function select<T extends string>(opts: {
  name: string;
  message: string;
  choices: Array<{ name: string; value: T } | string>;
}): Promise<T> {
  const e = new (
    Enquirer as unknown as new () => {
      prompt(o: Record<string, unknown>): Promise<Record<string, unknown>>;
    }
  )();
  const result = await e.prompt({
    type: "select",
    name: opts.name,
    message: opts.message,
    choices: opts.choices,
    result(this: { focused: { value: T } }) {
      return this.focused.value;
    },
  });
  return result[opts.name] as T;
}

export async function confirm(opts: {
  name: string;
  message: string;
  initial?: boolean;
}): Promise<boolean> {
  const e = new (
    Enquirer as unknown as new () => {
      prompt(o: Record<string, unknown>): Promise<Record<string, unknown>>;
    }
  )();
  const result = await e.prompt({ type: "confirm", ...opts } as Record<
    string,
    unknown
  >);
  return result[opts.name] as boolean;
}
