/**
 * Intelligent Routing Module
 *
 * Routes PI agent tool calls to the appropriate workspace
 * based on query intent, metadata tags, and descriptions.
 *
 * Uses fuzzy matching on tags + description keywords.
 */

import type { WorkspaceRegistry } from '../parser';
import type { WorkspaceResolver, WorkspaceInfo } from '../resolver';
import type { Logger } from "../security";

/**
 * Routing score for a single workspace.
 * Higher score = better match.
 */
export type RouteMatch = {
  workspace: string;
  score: number;
  matchedTags: string[];
  descriptionMatch: boolean;
};

/**
 * Routing result with ranked workspace matches.
 */
export type RouteResult =
  | { ok: true; matches: RouteMatch[]; primary: string }
  | { ok: false; error: string; candidates?: string[] };

/** Default tokenizer: lowercase + split on non-alpha. */
function tokenize(text: string): string[] {
  var lower = text.toLowerCase();
  return lower.split(/[\s,_\-]+/).filter(function(t) { return t.length > 0; });
}

/**
 * Score how well a query matches a workspace by tags.
 * Returns matched tags array.
 */
function scoreTags(queryTokens: string[], tags: string[]): { score: number; matched: string[] } {
  var tagLower: { [k: string]: string } = {};
  for (var i = 0; i < tags.length; i++) {
    tagLower[tags[i].toLowerCase()] = tags[i];
  }
  var matched: string[] = [];
  for (var i = 0; i < queryTokens.length; i++) {
    var tok = queryTokens[i].toLowerCase();
    if (tok.length < 3) continue;
    if (tagLower[tok]) {
      matched.push(tagLower[tok]);
    } else {
      // Partial: query token is a prefix or contains a tag
      for (var t in tagLower) {
        if (tok.indexOf(t) >= 0 || t.indexOf(tok) >= 0) {
          matched.push(tagLower[t]);
          break;
        }
      }
    }
  }
  return { score: matched.length, matched: matched };
}

/**
 * Score how well a query matches a workspace description.
 */
function scoreDescription(queryTokens: string[], description: string): { score: number; matched: boolean } {
  var descTokens = tokenize(description);
  var score = 0;
  var matched = false;
  for (var i = 0; i < queryTokens.length; i++) {
    var tok = queryTokens[i];
    if (tok.length < 3) continue;  // ignore short stopwords
    var tokLower = tok.toLowerCase();
    for (var j = 0; j < descTokens.length; j++) {
      var descTok = descTokens[j];
      var descTokLower = descTok.toLowerCase();
      // Bidirectional substring: either token contains the other
      if (descTokLower.indexOf(tokLower) >= 0 || tokLower.indexOf(descTokLower) >= 0) {
        score += 2;
        matched = true;
        break;
      }
    }
  }
  return { score, matched };
}

/**
 * Route a query to the best matching workspace(s).
 *
 * Returns workspace matches ranked by relevance score.
 * Returns primary workspace for direct tool calls.
 */
export function routeQuery(
  resolver: WorkspaceResolver,
  query: string
): RouteResult {
  try {
    if (!query || !query.trim()) {
      var names = resolver.names();
      if (names.length === 0) {
        return { ok: false, error: "No workspaces available", candidates: [] };
      }
      return { ok: true, matches: [], primary: names[0] };
    }

    var queryTokens = tokenize(query.trim());
    if (!queryTokens.length) {
      return { ok: false, error: "Empty query", candidates: resolver.names() };
    }

    var allNames = resolver.names();
    var matches: RouteMatch[] = [];
    var maxScore = 0;
    var primary = allNames[0];

    for (var i = 0; i < allNames.length; i++) {
      var name = allNames[i];
      var info = resolver.getInfo(name);
      if (!info) continue;

      var tagResult = scoreTags(queryTokens, info.tags);
      var descResult = scoreDescription(queryTokens, info.description);
      var totalScore = tagResult.score + descResult.score;

      if (totalScore > maxScore) {
        maxScore = totalScore;
        primary = info.name;
      }

      // Always include the best match; add others with score > 0 or empty tags
      if (info.name === primary || totalScore > 0)

        {
        matches.push({
          workspace: info.name,
          score: totalScore,
          matchedTags: tagResult.matched || [],
          descriptionMatch: descResult.matched,
        });
      }
    }

    matches.sort(function(a, b) { return b.score - a.score; });

    if (!primary || !resolver.exists(primary)) {
      primary = allNames[0] || "";
    }

    return { ok: true, matches: matches, primary: primary };
  } catch (err: unknown) {
    var msg = err instanceof Error ? err.message : String(err);
    var names = resolver.names();
    return { ok: false, error: msg, candidates: names };
  }
}

/**
 * Select workspace from query and optional explicit workspace hint.
 *
 * If explicitWorkspace is provided and valid, use it directly.
 * Otherwise, route the query to the best matching workspace.
 */
export function resolveWorkspace(
  resolver: WorkspaceResolver,
  query: string,
  explicitWorkspace?: string
): RouteResult {
  try {
    if (explicitWorkspace && explicitWorkspace.trim()) {
      var name = explicitWorkspace.trim();
      if (!resolver.exists(name)) {
        var names = resolver.names();
        return {
          ok: false,
          error: 'Workspace "' + name + '" not found',
          candidates: names,
        };
      }
      return { ok: true, matches: [{ workspace: name, score: 10, matchedTags: [], descriptionMatch: false }], primary: name };
    }
    return routeQuery(resolver, query);
  } catch (err: unknown) {
    var msg = err instanceof Error ? err.message : String(err);
    var names = resolver.names();
    return { ok: false, error: msg, candidates: names };
  }
}
