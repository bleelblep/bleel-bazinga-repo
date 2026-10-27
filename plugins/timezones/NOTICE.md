## Third-party code

This plugin is a Revenge Next port of **Timezones** (1.3.0) by **aniimalz**, from the official
Aliucord plugin collection, [Aliucord/plugins](https://github.com/Aliucord/plugins)
(`plugins/Timezones`).

From the original: setting a timezone per person, showing their local time beside their message
timestamp, the starter list of zones, and the shared timezone lookup at
`https://timezonedb.catvibers.me/api/user/bulk`.

Upstream is released under the **GPL-3.0**. This port is new code written for Revenge Next
(TypeScript, no Aliucord APIs) and is published under the same licence: GPL-3.0, full text in
`THIRD_PARTY_LICENSES/GPL-3.0.txt`.

`js/lib/zoneData.ts` is generated from the IANA tz database ([eggert/tz](https://github.com/eggert/tz):
`zone.tab`, `iso3166.tab`, `backward`), which is in the public domain. Place search uses
[Open-Meteo](https://open-meteo.com/)'s geocoding API (GeoNames data, CC BY 4.0).
