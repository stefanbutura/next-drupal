import breakpoints from './styles/vars/breakpoints.module.scss'

const baseBreakpoints = Object.fromEntries(
  Object.entries(breakpoints).map(([k, v]) => [k, parseInt(v)]),
)

export const defaultBreakpoint = breakpoints.defaultBreakpoint

export default baseBreakpoints
