import type { ElaborationDescriptor } from "./ElaborationDescriptor.js";

export class ElaborationDescriptorRegistry {
  private readonly byHook = new Map<string, ElaborationDescriptor>();
  private readonly byName = new Map<string, ElaborationDescriptor>();

  register(descriptor: ElaborationDescriptor): void {
    this.byName.set(descriptor.name, descriptor);
    this.byHook.set(descriptor.hook, descriptor);
  }

  getByHook(hook: string): ElaborationDescriptor | undefined {
    return this.byHook.get(hook);
  }

  getByName(name: string): ElaborationDescriptor | undefined {
    return this.byName.get(name);
  }

  hasHook(hook: string): boolean {
    return this.byHook.has(hook);
  }

  list(): readonly ElaborationDescriptor[] {
    return [...this.byName.values()];
  }
}
