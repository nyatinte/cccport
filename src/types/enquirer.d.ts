// src/types/enquirer.d.ts
declare module 'enquirer' {
  export default class Enquirer {
    prompt(options: Record<string, unknown> | Record<string, unknown>[]): Promise<Record<string, unknown>>
  }
  export class Select {
    constructor(options: { name: string; message: string; choices: unknown[] })
    run(): Promise<string>
  }
  export class Confirm {
    constructor(options: { name: string; message: string; initial?: boolean })
    run(): Promise<boolean>
  }
}
