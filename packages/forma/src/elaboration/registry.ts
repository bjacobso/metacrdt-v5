/**
 * DSL Handler Registry
 *
 * Manages registration and lookup of DSL handlers.
 */

import type { DSLHandler } from "./types.js";

/**
 * Registry of DSL handlers.
 */
export class DSLRegistry {
  private handlers = new Map<string, DSLHandler>();

  /**
   * Register a handler.
   */
  register<IR>(handler: DSLHandler<IR>): void {
    if (this.handlers.has(handler.name)) {
      throw new Error(`Handler already registered: ${handler.name}`);
    }
    this.handlers.set(handler.name, handler as DSLHandler);
  }

  /**
   * Get a handler by name.
   */
  get(name: string): DSLHandler | undefined {
    return this.handlers.get(name);
  }

  /**
   * Check if a handler exists.
   */
  has(name: string): boolean {
    return this.handlers.has(name);
  }

  /**
   * Get all handler names.
   */
  names(): IterableIterator<string> {
    return this.handlers.keys();
  }

  /**
   * Get all handlers.
   */
  all(): IterableIterator<DSLHandler> {
    return this.handlers.values();
  }

  /**
   * Get the handlers as a Map (for CompileContext).
   */
  toMap(): Map<string, DSLHandler> {
    return new Map(this.handlers);
  }

  /**
   * Create a new registry with additional handlers.
   */
  extend(...handlers: DSLHandler[]): DSLRegistry {
    const registry = new DSLRegistry();
    for (const [name, handler] of this.handlers) {
      registry.handlers.set(name, handler);
    }
    for (const handler of handlers) {
      registry.register(handler);
    }
    return registry;
  }

  /**
   * Create a new registry from handlers.
   */
  static from(...handlers: DSLHandler[]): DSLRegistry {
    const registry = new DSLRegistry();
    for (const handler of handlers) {
      registry.register(handler);
    }
    return registry;
  }
}

/**
 * Default empty registry.
 */
export const emptyRegistry = new DSLRegistry();
