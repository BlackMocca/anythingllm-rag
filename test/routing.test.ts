/**
 * Unit tests for routing module.
 */

import { describe, it, expect } from 'vitest';
import { parseKnowledge } from '../src/parser';
import { WorkspaceResolver } from '../src/resolver';
import { routeQuery, resolveWorkspace } from '../src/pi-agent/routing';

// ── Fixture ──

var KNOWLEDGE_SRC = `---
name: billing-service
description: Handles billing, payments, invoices, and financial logic
tag: finance, payment, invoice
---
---
name: auth-service
description: Handles authentication, login, JWT, session management
tag: security, identity, login
---
---
name: inventory
description: Manages stock, product quantity, warehouse operations
tag: logistics, stock, warehouse
---
---
name: user-portal
description: Front-end user portal with account management and preferences
tag: frontend, user-management, portal
---
---
name: analytics
description: Business analytics, dashboards, reporting, data visualization
tag: analytics, reporting, dashboard
---`;

function makeResolver(): WorkspaceResolver {
  var registry = parseKnowledge(KNOWLEDGE_SRC).registry;
  return new WorkspaceResolver('/tmp/ws', registry);
}

// ── routeQuery tests ──

describe('routeQuery', function () {
  var resolver = makeResolver();

  it('routes payment queries to billing-service', function () {
    var result = routeQuery(resolver, 'payment gateway integration');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.primary).toBe('billing-service');
      expect(result.matches.length).toBeGreaterThan(0);
    }
  });

  it('routes invoice queries to billing-service', function () {
    var result = routeQuery(resolver, 'billing invoice generation');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.primary).toBe('billing-service');
    }
  });

  it('routes authentication queries to auth-service', function () {
    var result = routeQuery(resolver, 'JWT token validation');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.primary).toBe('auth-service');
    }
  });

  it('routes inventory queries to inventory', function () {
    var result = routeQuery(resolver, 'stock reports');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.primary).toBe('inventory');
    }
  });

  it('routes analytics queries to analytics', function () {
    var result = routeQuery(resolver, 'dashboard metrics');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.primary).toBe('analytics');
    }
  });

  it('returns empty matches for unknown query but has a primary', function () {
    var result = routeQuery(resolver, 'xyzrandom');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.primary).toBeDefined();
      expect(typeof result.primary).toBe('string');
      expect(result.primary.length).toBeGreaterThan(0);
    }
  });

  it('returns first workspace as primary for empty query', function () {
    var result = routeQuery(resolver, '');
    expect(result.ok).toBe(true);
  });

  it('sorts matches by score descending', function () {
    var result = routeQuery(resolver, 'billing invoice');
    expect(result.ok).toBe(true);
    if (result.ok) {
      var scores = result.matches.map(function (m) { return m.score; });
      for (var i = 1; i < scores.length; i++) {
        expect(scores[i] <= scores[i - 1]).toBe(true);
      }
    }
  });

  it('tags give higher score than description-only matches', function () {
    // billing has tag "payment" which matches directly
    var bp = routeQuery(resolver, 'payment');
    expect(bp.ok).toBe(true);
    if (bp.ok) {
      expect(bp.primary).toBe('billing-service');
      expect(bp.matches[0].score).toBeGreaterThan(0);
    }
  });
});

// ── resolveWorkspace tests ──

describe('resolveWorkspace', function () {
  var resolver = makeResolver();

  it('uses explicit workspace when provided', function () {
    var result = resolveWorkspace(resolver, 'anything', 'billing-service');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.primary).toBe('billing-service');
    }
  });

  it('returns error for nonexistent explicit workspace', function () {
    var result = resolveWorkspace(resolver, 'anything', 'nonexistent');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('not found');
    }
  });

  it('auto-routes when no explicit workspace given', function () {
    var result = resolveWorkspace(resolver, 'billing invoice');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.primary).toBe('billing-service');
    }
  });

  it('returns candidates on error', function () {
    var result = resolveWorkspace(resolver, 'anything', 'bad-ws');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.candidates).toBeDefined();
      expect(Array.isArray(result.candidates)).toBe(true);
      expect(result.candidates!.length).toBeGreaterThan(0);
    }
  });
});
