/** Route names and where the rows landed, in a file of their own so pages and registration do not import each other. */
export const HUB_ROUTE = 'BleelblepHub'
export const AI_HUB_ROUTE = 'BleelblepHubAi'
export const MANAGE_ROUTE = 'BleelblepHubManage'
export const SETTINGS_ROUTE = 'BleelblepHubSettings'
export const AI_SETTINGS_ROUTE = 'BleelblepHubAiSettings'

/** Where the Hub rows actually ended up, for the Settings page to report. Porting rule 3. */
export const placement = { where: 'not yet registered' }
