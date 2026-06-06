import type { KbType, User } from './api'

export const ROLES = {
  admin: 'admin',
  compliance: 'compliance',
  product: 'product',
} as const

export type AppRole = typeof ROLES[keyof typeof ROLES]

export const ROLE_ALIASES: Record<string, AppRole> = {
  admin: ROLES.admin,
  administrator: ROLES.admin,
  boss: ROLES.admin,
  bosses: ROLES.admin,
  ceo: ROLES.admin,

  compli: ROLES.compliance,
  compliance: ROLES.compliance,
  compliance_department: ROLES.compliance,
  compliance_department_risk_manager: ROLES.compliance,
  compliance_officer: ROLES.compliance,
  risk: ROLES.compliance,
  risk_manager: ROLES.compliance,

  product: ROLES.product,
  product_it_po: ROLES.product,
  product_it: ROLES.product,
  po: ROLES.product,
  it: ROLES.product,
}

export const normalizeRole = (role?: string | null): AppRole | '' => {
  const key = (role || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return ROLE_ALIASES[key] ?? ''
}

export function hasRole(user: User | null, allowedRoles?: readonly string[]) {
  if (!allowedRoles || allowedRoles.length === 0) return true
  return allowedRoles.includes(normalizeRole(user?.role))
}

export function canAccessAnalyses(user: User | null) {
  return hasRole(user, [ROLES.admin, ROLES.compliance])
}

export function canAccessReport(user: User | null) {
  return hasRole(user, [ROLES.admin])
}

export function canAccessKb(user: User | null, kbType: KbType) {
  if (kbType === 'law') return hasRole(user, [ROLES.admin, ROLES.compliance])
  if (kbType === 'report') return hasRole(user, [ROLES.admin])
  return hasRole(user, [ROLES.admin, ROLES.compliance, ROLES.product])
}
