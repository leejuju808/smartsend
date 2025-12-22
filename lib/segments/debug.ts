// lib/segments/debug.ts

export type ComparisonOp =
  | 'eq'
  | 'neq'
  | 'contains'
  | 'not_contains'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'not_in'
  | 'is_null'
  | 'not_null'
  | '=' // Support legacy operators
  | '!='
  | '>';

export type SegmentCondition = {
  type: 'condition';
  id: string;
  field: string; // e.g. "email", "company_size", "meta.country"
  op: ComparisonOp;
  value?: any;
};

export type SegmentGroup = {
  type: 'group';
  id: string;
  mode: 'AND' | 'OR';
  children: SegmentRuleNode[];
};

export type SegmentRuleNode = SegmentCondition | SegmentGroup;

export type DebugLeaf = {
  type: 'condition';
  id: string;
  field: string;
  op: ComparisonOp;
  value?: any;
  passed: boolean;
  leadValue: any;
  reason: string;
};

export type DebugGroup = {
  type: 'group';
  id: string;
  mode: 'AND' | 'OR';
  passed: boolean;
  children: DebugNode[];
};

export type DebugNode = DebugLeaf | DebugGroup;

export type SegmentDebugResult<L = any> = {
  lead: L;
  matched: boolean;
  tree: DebugNode;
  // flattened leaf-level list for easy UI:
  leaves: DebugLeaf[];
};

function getLeadFieldValue(lead: any, field: string): any {
  // Handle company.* fields - access via companies relationship
  if (field.startsWith("company.")) {
    const companyField = field.replace("company.", "");
    // Check if companies is an object (single) or array (multiple)
    if (lead.companies) {
      // If companies is an object (from select with companies(*))
      if (typeof lead.companies === 'object' && !Array.isArray(lead.companies)) {
        return lead.companies[companyField];
      }
      // If companies is an array, take the first one
      if (Array.isArray(lead.companies) && lead.companies.length > 0) {
        return lead.companies[0][companyField];
      }
    }
    // Fallback: check if company data is nested differently
    if (lead.company_id && lead.company) {
      // Try accessing via company object if it exists
      return lead.company[companyField];
    }
    return undefined;
  }
  
  // Supports nested paths like "meta.country"
  const parts = field.split('.');
  let current: any = lead;

  for (const p of parts) {
    if (current == null) return undefined;
    current = current[p];
  }

  return current;
}

function compareValue(op: ComparisonOp, leadValue: any, ruleValue: any, field?: string): { passed: boolean; reason: string } {
  // Normalize legacy operators
  const normalizedOp = op === '=' ? 'eq' : op === '!=' ? 'neq' : op === '>' ? 'gt' : op === '<' ? 'lt' : op;
  
  // Handle tech_stack array contains
  if (field === 'company.tech_stack' && Array.isArray(leadValue) && Array.isArray(ruleValue)) {
    const passed = ruleValue.some((tech: string) => 
      leadValue.some((lv: any) => 
        String(lv).toLowerCase() === String(tech).toLowerCase()
      )
    );
    return { 
      passed, 
      reason: passed 
        ? `Company uses ${ruleValue.join(' + ')}` 
        : `Company does not use ${ruleValue.join(' + ')}` 
    };
  }
  
  switch (normalizedOp) {
    case 'eq': {
      const passed = leadValue === ruleValue;
      if (field?.startsWith('company.')) {
        const companyField = field.replace('company.', '');
        if (companyField === 'industry') {
          return { passed, reason: passed ? `Company is in ${ruleValue} industry` : `Company is not in ${ruleValue} industry` };
        }
        if (companyField === 'size') {
          return { passed, reason: passed ? `Company size is ${ruleValue}` : `Company size is not ${ruleValue}` };
        }
        if (companyField === 'domain') {
          return { passed, reason: passed ? `Company domain is ${ruleValue}` : `Company domain is not ${ruleValue}` };
        }
        if (companyField === 'engagement_score') {
          return { passed, reason: passed ? `Company engagement score equals ${ruleValue}` : `Company engagement score does not equal ${ruleValue}` };
        }
      }
      return { passed, reason: passed ? 'Equal' : 'Not equal' };
    }
    case 'neq': {
      const passed = leadValue !== ruleValue;
      return { passed, reason: passed ? 'Not equal' : 'Equal' };
    }
    case 'contains': {
      const lv = (leadValue ?? '').toString().toLowerCase();
      const rv = (ruleValue ?? '').toString().toLowerCase();
      const passed = lv.includes(rv);
      if (field?.startsWith('company.')) {
        const companyField = field.replace('company.', '');
        if (companyField === 'industry') {
          return { passed, reason: passed ? `Company industry contains "${ruleValue}"` : `Company industry does not contain "${ruleValue}"` };
        }
      }
      return { passed, reason: passed ? 'Contains value' : 'Does not contain value' };
    }
    case 'not_contains': {
      const lv = (leadValue ?? '').toString().toLowerCase();
      const rv = (ruleValue ?? '').toString().toLowerCase();
      const passed = !lv.includes(rv);
      return { passed, reason: passed ? 'Does not contain value' : 'Contains value' };
    }
    case 'gt': {
      const lv = Number(leadValue);
      const rv = Number(ruleValue);
      const passed = !Number.isNaN(lv) && lv > rv;
      return { passed, reason: passed ? 'Greater than' : 'Not greater than' };
    }
    case 'gte': {
      const lv = Number(leadValue);
      const rv = Number(ruleValue);
      const passed = !Number.isNaN(lv) && lv >= rv;
      if (field === 'company.engagement_score') {
        return { passed, reason: passed ? `Company has ${rv}+ engagement events` : `Company has less than ${rv} engagement events` };
      }
      return { passed, reason: passed ? 'Greater than or equal' : 'Less than' };
    }
    case 'lt': {
      const lv = Number(leadValue);
      const rv = Number(ruleValue);
      const passed = !Number.isNaN(lv) && lv < rv;
      return { passed, reason: passed ? 'Less than' : 'Not less than' };
    }
    case 'lte': {
      const lv = Number(leadValue);
      const rv = Number(ruleValue);
      const passed = !Number.isNaN(lv) && lv <= rv;
      return { passed, reason: passed ? 'Less than or equal' : 'Greater than' };
    }
    case 'in': {
      const arr = Array.isArray(ruleValue) ? ruleValue : [ruleValue];
      const passed = arr.includes(leadValue);
      return { passed, reason: passed ? 'In list' : 'Not in list' };
    }
    case 'not_in': {
      const arr = Array.isArray(ruleValue) ? ruleValue : [ruleValue];
      const passed = !arr.includes(leadValue);
      return { passed, reason: passed ? 'Not in list' : 'In list' };
    }
    case 'is_null': {
      const passed = leadValue == null;
      return { passed, reason: passed ? 'Is null/empty' : 'Has a value' };
    }
    case 'not_null': {
      const passed = leadValue != null;
      return { passed, reason: passed ? 'Has a value' : 'Is null/empty' };
    }
    default:
      return { passed: false, reason: 'Unsupported operator' };
  }
}

function evaluateNode(node: SegmentRuleNode, lead: any): DebugNode {
  if (node.type === 'condition') {
    const leadValue = getLeadFieldValue(lead, node.field);
    const { passed, reason } = compareValue(node.op, leadValue, node.value, node.field);

    const leaf: DebugLeaf = {
      type: 'condition',
      id: node.id,
      field: node.field,
      op: node.op,
      value: node.value,
      passed,
      leadValue,
      reason,
    };

    return leaf;
  }

  // group node
  const childrenDebug = node.children.map((child) => evaluateNode(child, lead));

  let passed: boolean;
  if (node.mode === 'AND') {
    passed = childrenDebug.every((c) => c.passed);
  } else {
    // OR
    passed = childrenDebug.some((c) => c.passed);
  }

  const group: DebugGroup = {
    type: 'group',
    id: node.id,
    mode: node.mode,
    passed,
    children: childrenDebug,
  };

  return group;
}

function flattenLeaves(node: DebugNode, acc: DebugLeaf[] = []): DebugLeaf[] {
  if (node.type === 'condition') {
    acc.push(node);
    return acc;
  }

  for (const child of node.children) {
    flattenLeaves(child, acc);
  }
  return acc;
}

/**
 * Convert flat conditions array (from current schema) to tree structure
 * This adapts the existing flat conditions to the tree format
 */
function normalizeRules(rules: any): SegmentRuleNode | null {
  if (!rules) return null;

  // If it's already a tree structure (has type field)
  if (rules.type === 'condition' || rules.type === 'group') {
    return rules as SegmentRuleNode;
  }

  // If it's an array of conditions (flat structure from current schema)
  if (Array.isArray(rules)) {
    if (rules.length === 0) return null;

    // Map operators from current schema to ComparisonOp
    // Keep original operators as they'll be normalized in compareValue
    const opMap: Record<string, ComparisonOp> = {
      '=': '=',
      '!=': '!=',
      'contains': 'contains',
      '>': '>',
      '<': '<',
    };

    // Convert flat conditions to tree with AND group
    const conditions: SegmentCondition[] = rules.map((cond: any, idx: number) => ({
      type: 'condition',
      id: cond.id || `cond-${idx}`,
      field: cond.field,
      op: opMap[cond.op] || 'eq',
      value: cond.value,
    }));

    if (conditions.length === 1) {
      return conditions[0];
    }

    return {
      type: 'group',
      id: 'root',
      mode: 'AND',
      children: conditions,
    };
  }

  // If it's an object (could be rule jsonb from segments table)
  if (typeof rules === 'object') {
    // Try to detect structure
    if (rules.type) {
      return rules as SegmentRuleNode;
    }
    // If it has conditions array, normalize it
    if (rules.conditions && Array.isArray(rules.conditions)) {
      return normalizeRules(rules.conditions);
    }
  }

  return null;
}

export function evaluateSegmentTreeWithDebug<L = any>(
  rules: any,
  lead: L
): SegmentDebugResult<L> {
  const normalizedRules = normalizeRules(rules);

  if (!normalizedRules) {
    // if no rules, segment = "everyone"
    const tree: DebugGroup = {
      type: 'group',
      id: 'root',
      mode: 'AND',
      passed: true,
      children: [],
    };
    return {
      lead,
      matched: true,
      tree,
      leaves: [],
    };
  }

  const tree = evaluateNode(normalizedRules, lead);
  const leaves = flattenLeaves(tree);
  return {
    lead,
    matched: tree.passed,
    tree,
    leaves,
  };
}

