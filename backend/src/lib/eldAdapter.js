/**
 * eldAdapter.js — Pluggable ELD provider abstraction.
 *
 * All provider adapters normalise their data into the canonical
 * ELDEvent shape before the hosEngine processes it. Adding a new
 * provider = one new file in integrations/eld/ + register here.
 */

const PROVIDERS = {
  samsara:    () => require('../integrations/eld/samsara'),
  motive:     () => require('../integrations/eld/motive'),
  omnitracs:  () => require('../integrations/eld/omnitracs'),
  geotab:     () => require('../integrations/eld/geotab'),
  peoplenet:  () => require('../integrations/eld/peoplenet'),
  bigroad:    () => require('../integrations/eld/bigroad'),
  webhook:    () => require('../integrations/eld/webhook'),
  manual:     () => require('../integrations/eld/manual'),
};

/**
 * Get an ELD adapter by provider name.
 * @param {string} provider - e.g. 'samsara'
 * @returns {{ normalise: Function, pollDriver?: Function }}
 */
function getAdapter(provider) {
  const key     = (provider || process.env.DEFAULT_ELD_PROVIDER || 'manual').toLowerCase();
  const factory = PROVIDERS[key] || PROVIDERS.manual;
  return factory();
}

module.exports = { getAdapter };
