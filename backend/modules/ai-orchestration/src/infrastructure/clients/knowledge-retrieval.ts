/** BE-AI-005 — Tenant-filtered knowledge retrieval client (knowledge module port). */

import type { PublishedSearchHit } from "@ai-sales/module-knowledge";

export interface KnowledgeRetrievalPort {
  search(args: {
    readonly tenantId: string;
    readonly query: string;
    readonly topK?: number;
  }): Promise<readonly PublishedSearchHit[]>;
}

export function createKnowledgeRetrievalClient(options: {
  readonly search: KnowledgeRetrievalPort["search"];
}): KnowledgeRetrievalPort {
  return {
    async search(args) {
      if (!args.tenantId.trim()) return [];
      return options.search(args);
    }
  };
}

export class InMemoryKnowledgeRetrievalStub implements KnowledgeRetrievalPort {
  constructor(private readonly hitsByTenant: Map<string, readonly PublishedSearchHit[]> = new Map()) {}

  seed(tenantId: string, hits: readonly PublishedSearchHit[]): void {
    this.hitsByTenant.set(tenantId, hits);
  }

  async search(args: {
    readonly tenantId: string;
    readonly query: string;
    readonly topK?: number;
  }): Promise<readonly PublishedSearchHit[]> {
    const all = this.hitsByTenant.get(args.tenantId) ?? [];
    const needle = args.query.trim().toLowerCase();
    if (!needle) return [];
    const filtered = all.filter(
      (h) => h.snippet.toLowerCase().includes(needle) || h.title.toLowerCase().includes(needle)
    );
    return filtered.slice(0, args.topK ?? 5);
  }
}
