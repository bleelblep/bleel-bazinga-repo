/**
 * Generated from the IANA tz database (github.com/eggert/tz, public domain): zone.tab, iso3166.tab
 * and the old names in `backward`. Regenerate from those files rather than editing by hand.
 */

/** Country code → the name tz uses. */
export const COUNTRY_NAMES: Record<string, string> = {"AD":"Andorra","AE":"United Arab Emirates","AF":"Afghanistan","AG":"Antigua & Barbuda","AI":"Anguilla","AL":"Albania","AM":"Armenia","AO":"Angola","AQ":"Antarctica","AR":"Argentina","AS":"Samoa (American)","AT":"Austria","AU":"Australia","AW":"Aruba","AX":"Åland Islands","AZ":"Azerbaijan","BA":"Bosnia & Herzegovina","BB":"Barbados","BD":"Bangladesh","BE":"Belgium","BF":"Burkina Faso","BG":"Bulgaria","BH":"Bahrain","BI":"Burundi","BJ":"Benin","BL":"St Barthelemy","BM":"Bermuda","BN":"Brunei","BO":"Bolivia","BQ":"Caribbean NL","BR":"Brazil","BS":"Bahamas","BT":"Bhutan","BV":"Bouvet Island","BW":"Botswana","BY":"Belarus","BZ":"Belize","CA":"Canada","CC":"Cocos (Keeling) Islands","CD":"Congo (Dem. Rep.)","CF":"Central African Rep.","CG":"Congo (Rep.)","CH":"Switzerland","CI":"Côte d’Ivoire","CK":"Cook Islands","CL":"Chile","CM":"Cameroon","CN":"China","CO":"Colombia","CR":"Costa Rica","CU":"Cuba","CV":"Cape Verde","CW":"Curaçao","CX":"Christmas Island","CY":"Cyprus","CZ":"Czech Republic","DE":"Germany","DJ":"Djibouti","DK":"Denmark","DM":"Dominica","DO":"Dominican Republic","DZ":"Algeria","EC":"Ecuador","EE":"Estonia","EG":"Egypt","EH":"Western Sahara","ER":"Eritrea","ES":"Spain","ET":"Ethiopia","FI":"Finland","FJ":"Fiji","FK":"Falkland Islands","FM":"Micronesia","FO":"Faroe Islands","FR":"France","GA":"Gabon","GB":"Britain (UK)","GD":"Grenada","GE":"Georgia","GF":"French Guiana","GG":"Guernsey","GH":"Ghana","GI":"Gibraltar","GL":"Greenland","GM":"Gambia","GN":"Guinea","GP":"Guadeloupe","GQ":"Equatorial Guinea","GR":"Greece","GS":"South Georgia & the South Sandwich Islands","GT":"Guatemala","GU":"Guam","GW":"Guinea-Bissau","GY":"Guyana","HK":"Hong Kong","HM":"Heard Island & McDonald Islands","HN":"Honduras","HR":"Croatia","HT":"Haiti","HU":"Hungary","ID":"Indonesia","IE":"Ireland","IL":"Israel","IM":"Isle of Man","IN":"India","IO":"British Indian Ocean Territory","IQ":"Iraq","IR":"Iran","IS":"Iceland","IT":"Italy","JE":"Jersey","JM":"Jamaica","JO":"Jordan","JP":"Japan","KE":"Kenya","KG":"Kyrgyzstan","KH":"Cambodia","KI":"Kiribati","KM":"Comoros","KN":"St Kitts & Nevis","KP":"Korea (North)","KR":"Korea (South)","KW":"Kuwait","KY":"Cayman Islands","KZ":"Kazakhstan","LA":"Laos","LB":"Lebanon","LC":"St Lucia","LI":"Liechtenstein","LK":"Sri Lanka","LR":"Liberia","LS":"Lesotho","LT":"Lithuania","LU":"Luxembourg","LV":"Latvia","LY":"Libya","MA":"Morocco","MC":"Monaco","MD":"Moldova","ME":"Montenegro","MF":"St Martin (French)","MG":"Madagascar","MH":"Marshall Islands","MK":"North Macedonia","ML":"Mali","MM":"Myanmar (Burma)","MN":"Mongolia","MO":"Macau","MP":"Northern Mariana Islands","MQ":"Martinique","MR":"Mauritania","MS":"Montserrat","MT":"Malta","MU":"Mauritius","MV":"Maldives","MW":"Malawi","MX":"Mexico","MY":"Malaysia","MZ":"Mozambique","NA":"Namibia","NC":"New Caledonia","NE":"Niger","NF":"Norfolk Island","NG":"Nigeria","NI":"Nicaragua","NL":"Netherlands","NO":"Norway","NP":"Nepal","NR":"Nauru","NU":"Niue","NZ":"New Zealand","OM":"Oman","PA":"Panama","PE":"Peru","PF":"French Polynesia","PG":"Papua New Guinea","PH":"Philippines","PK":"Pakistan","PL":"Poland","PM":"St Pierre & Miquelon","PN":"Pitcairn","PR":"Puerto Rico","PS":"Palestine","PT":"Portugal","PW":"Palau","PY":"Paraguay","QA":"Qatar","RE":"Réunion","RO":"Romania","RS":"Serbia","RU":"Russia","RW":"Rwanda","SA":"Saudi Arabia","SB":"Solomon Islands","SC":"Seychelles","SD":"Sudan","SE":"Sweden","SG":"Singapore","SH":"St Helena","SI":"Slovenia","SJ":"Svalbard & Jan Mayen","SK":"Slovakia","SL":"Sierra Leone","SM":"San Marino","SN":"Senegal","SO":"Somalia","SR":"Suriname","SS":"South Sudan","ST":"Sao Tome & Principe","SV":"El Salvador","SX":"St Maarten (Dutch)","SY":"Syria","SZ":"Eswatini (Swaziland)","TC":"Turks & Caicos Is","TD":"Chad","TF":"French S. Terr.","TG":"Togo","TH":"Thailand","TJ":"Tajikistan","TK":"Tokelau","TL":"East Timor","TM":"Turkmenistan","TN":"Tunisia","TO":"Tonga","TR":"Turkey","TT":"Trinidad & Tobago","TV":"Tuvalu","TW":"Taiwan","TZ":"Tanzania","UA":"Ukraine","UG":"Uganda","UM":"US minor outlying islands","US":"United States","UY":"Uruguay","UZ":"Uzbekistan","VA":"Vatican City","VC":"St Vincent","VE":"Venezuela","VG":"Virgin Islands (UK)","VI":"Virgin Islands (US)","VN":"Vietnam","VU":"Vanuatu","WF":"Wallis & Futuna","WS":"Samoa (western)","YE":"Yemen","YT":"Mayotte","ZA":"South Africa","ZM":"Zambia","ZW":"Zimbabwe"}

/** "CC|Zone|note" per line: every zone, with the country it's in and tz's note on which part. */
export const ZONE_TAB = `AD|Europe/Andorra|
AE|Asia/Dubai|
AF|Asia/Kabul|
AG|America/Antigua|
AI|America/Anguilla|
AL|Europe/Tirane|
AM|Asia/Yerevan|
AO|Africa/Luanda|
AQ|Antarctica/McMurdo|New Zealand time - McMurdo, South Pole
AQ|Antarctica/Casey|Casey
AQ|Antarctica/Davis|Davis
AQ|Antarctica/DumontDUrville|Dumont-d'Urville
AQ|Antarctica/Mawson|Mawson
AQ|Antarctica/Palmer|Palmer
AQ|Antarctica/Rothera|Rothera
AQ|Antarctica/Syowa|Syowa
AQ|Antarctica/Troll|Troll
AQ|Antarctica/Vostok|Vostok
AR|America/Argentina/Buenos_Aires|Buenos Aires (BA, CF)
AR|America/Argentina/Cordoba|Argentina (most areas: CB, CC, CN, ER, FM, MN, SE, SF)
AR|America/Argentina/Salta|Salta (SA, LP, NQ, RN)
AR|America/Argentina/Jujuy|Jujuy (JY)
AR|America/Argentina/Tucuman|Tucuman (TM)
AR|America/Argentina/Catamarca|Catamarca (CT), Chubut (CH)
AR|America/Argentina/La_Rioja|La Rioja (LR)
AR|America/Argentina/San_Juan|San Juan (SJ)
AR|America/Argentina/Mendoza|Mendoza (MZ)
AR|America/Argentina/San_Luis|San Luis (SL)
AR|America/Argentina/Rio_Gallegos|Santa Cruz (SC)
AR|America/Argentina/Ushuaia|Tierra del Fuego (TF)
AS|Pacific/Pago_Pago|
AT|Europe/Vienna|
AU|Australia/Lord_Howe|Lord Howe Island
AU|Antarctica/Macquarie|Macquarie Island
AU|Australia/Hobart|Tasmania
AU|Australia/Melbourne|Victoria
AU|Australia/Sydney|New South Wales (most areas)
AU|Australia/Broken_Hill|New South Wales (Yancowinna)
AU|Australia/Brisbane|Queensland (most areas)
AU|Australia/Lindeman|Queensland (Whitsunday Islands)
AU|Australia/Adelaide|South Australia
AU|Australia/Darwin|Northern Territory
AU|Australia/Perth|Western Australia (most areas)
AU|Australia/Eucla|Western Australia (Eucla)
AW|America/Aruba|
AX|Europe/Mariehamn|
AZ|Asia/Baku|
BA|Europe/Sarajevo|
BB|America/Barbados|
BD|Asia/Dhaka|
BE|Europe/Brussels|
BF|Africa/Ouagadougou|
BG|Europe/Sofia|
BH|Asia/Bahrain|
BI|Africa/Bujumbura|
BJ|Africa/Porto-Novo|
BL|America/St_Barthelemy|
BM|Atlantic/Bermuda|
BN|Asia/Brunei|
BO|America/La_Paz|
BQ|America/Kralendijk|
BR|America/Noronha|Atlantic islands
BR|America/Belem|Para (east), Amapa
BR|America/Fortaleza|Brazil (northeast: MA, PI, CE, RN, PB)
BR|America/Recife|Pernambuco
BR|America/Araguaina|Tocantins
BR|America/Maceio|Alagoas, Sergipe
BR|America/Bahia|Bahia
BR|America/Sao_Paulo|Brazil (southeast: GO, DF, MG, ES, RJ, SP, PR, SC, RS)
BR|America/Campo_Grande|Mato Grosso do Sul
BR|America/Cuiaba|Mato Grosso
BR|America/Santarem|Para (west)
BR|America/Porto_Velho|Rondonia
BR|America/Boa_Vista|Roraima
BR|America/Manaus|Amazonas (east)
BR|America/Eirunepe|Amazonas (west)
BR|America/Rio_Branco|Acre
BS|America/Nassau|
BT|Asia/Thimphu|
BW|Africa/Gaborone|
BY|Europe/Minsk|
BZ|America/Belize|
CA|America/St_Johns|Newfoundland, Labrador (SE)
CA|America/Halifax|Atlantic - NS (most areas), PE
CA|America/Glace_Bay|Atlantic - NS (Cape Breton)
CA|America/Moncton|Atlantic - New Brunswick
CA|America/Goose_Bay|Atlantic - Labrador (most areas)
CA|America/Blanc-Sablon|AST - QC (Lower North Shore)
CA|America/Toronto|Eastern - ON & QC (most areas)
CA|America/Iqaluit|Eastern - NU (most areas)
CA|America/Atikokan|EST - ON (Atikokan), NU (Coral H)
CA|America/Winnipeg|EST - Manitoba, ON (northwest)
CA|America/Resolute|Central - NU (Resolute)
CA|America/Rankin_Inlet|Central - NU (central)
CA|America/Regina|CST - SK (most areas)
CA|America/Swift_Current|CST - SK (midwest)
CA|America/Edmonton|CST - AB, BC(E), NT(E), SK(W)
CA|America/Cambridge_Bay|Mountain - NU (west)
CA|America/Inuvik|CST - NT (west)
CA|America/Vancouver|MST - BC (most areas)
CA|America/Creston|MST - BC (Creston)
CA|America/Dawson_Creek|MST - BC (Dawson Cr, Ft St John)
CA|America/Fort_Nelson|MST - BC (Ft Nelson)
CA|America/Whitehorse|MST - Yukon (east)
CA|America/Dawson|MST - Yukon (west)
CC|Indian/Cocos|
CD|Africa/Kinshasa|Dem. Rep. of Congo (west)
CD|Africa/Lubumbashi|Dem. Rep. of Congo (east)
CF|Africa/Bangui|
CG|Africa/Brazzaville|
CH|Europe/Zurich|
CI|Africa/Abidjan|
CK|Pacific/Rarotonga|
CL|America/Santiago|most of Chile
CL|America/Coyhaique|Aysen Region
CL|America/Punta_Arenas|Magallanes Region
CL|Pacific/Easter|Easter Island
CM|Africa/Douala|
CN|Asia/Shanghai|Beijing Time
CN|Asia/Urumqi|Xinjiang Time
CO|America/Bogota|
CR|America/Costa_Rica|
CU|America/Havana|
CV|Atlantic/Cape_Verde|
CW|America/Curacao|
CX|Indian/Christmas|
CY|Asia/Nicosia|most of Cyprus
CY|Asia/Famagusta|Northern Cyprus
CZ|Europe/Prague|
DE|Europe/Berlin|most of Germany
DE|Europe/Busingen|Busingen
DJ|Africa/Djibouti|
DK|Europe/Copenhagen|
DM|America/Dominica|
DO|America/Santo_Domingo|
DZ|Africa/Algiers|
EC|America/Guayaquil|Ecuador (mainland)
EC|Pacific/Galapagos|Galapagos Islands
EE|Europe/Tallinn|
EG|Africa/Cairo|
EH|Africa/El_Aaiun|
ER|Africa/Asmara|
ES|Europe/Madrid|Spain (mainland)
ES|Africa/Ceuta|Ceuta, Melilla
ES|Atlantic/Canary|Canary Islands
ET|Africa/Addis_Ababa|
FI|Europe/Helsinki|
FJ|Pacific/Fiji|
FK|Atlantic/Stanley|
FM|Pacific/Chuuk|Chuuk/Truk, Yap
FM|Pacific/Pohnpei|Pohnpei/Ponape
FM|Pacific/Kosrae|Kosrae
FO|Atlantic/Faroe|
FR|Europe/Paris|
GA|Africa/Libreville|
GB|Europe/London|
GD|America/Grenada|
GE|Asia/Tbilisi|
GF|America/Cayenne|
GG|Europe/Guernsey|
GH|Africa/Accra|
GI|Europe/Gibraltar|
GL|America/Nuuk|most of Greenland
GL|America/Danmarkshavn|National Park (east coast)
GL|America/Scoresbysund|Scoresbysund/Ittoqqortoormiit
GL|America/Thule|Thule/Pituffik
GM|Africa/Banjul|
GN|Africa/Conakry|
GP|America/Guadeloupe|
GQ|Africa/Malabo|
GR|Europe/Athens|
GS|Atlantic/South_Georgia|
GT|America/Guatemala|
GU|Pacific/Guam|
GW|Africa/Bissau|
GY|America/Guyana|
HK|Asia/Hong_Kong|
HN|America/Tegucigalpa|
HR|Europe/Zagreb|
HT|America/Port-au-Prince|
HU|Europe/Budapest|
ID|Asia/Jakarta|Java, Sumatra
ID|Asia/Pontianak|Borneo (west, central)
ID|Asia/Makassar|Borneo (east, south), Sulawesi/Celebes, Bali, Nusa Tengarra, Timor (west)
ID|Asia/Jayapura|New Guinea (West Papua / Irian Jaya), Malukus/Moluccas
IE|Europe/Dublin|
IL|Asia/Jerusalem|
IM|Europe/Isle_of_Man|
IN|Asia/Kolkata|
IO|Indian/Chagos|
IQ|Asia/Baghdad|
IR|Asia/Tehran|
IS|Atlantic/Reykjavik|
IT|Europe/Rome|
JE|Europe/Jersey|
JM|America/Jamaica|
JO|Asia/Amman|
JP|Asia/Tokyo|
KE|Africa/Nairobi|
KG|Asia/Bishkek|
KH|Asia/Phnom_Penh|
KI|Pacific/Tarawa|Gilbert Islands
KI|Pacific/Kanton|Phoenix Islands
KI|Pacific/Kiritimati|Line Islands
KM|Indian/Comoro|
KN|America/St_Kitts|
KP|Asia/Pyongyang|
KR|Asia/Seoul|
KW|Asia/Kuwait|
KY|America/Cayman|
KZ|Asia/Almaty|most of Kazakhstan
KZ|Asia/Qyzylorda|Qyzylorda/Kyzylorda/Kzyl-Orda
KZ|Asia/Qostanay|Qostanay/Kostanay/Kustanay
KZ|Asia/Aqtobe|Aqtobe/Aktobe
KZ|Asia/Aqtau|Mangghystau/Mankistau
KZ|Asia/Atyrau|Atyrau/Atirau/Gur'yev
KZ|Asia/Oral|West Kazakhstan
LA|Asia/Vientiane|
LB|Asia/Beirut|
LC|America/St_Lucia|
LI|Europe/Vaduz|
LK|Asia/Colombo|
LR|Africa/Monrovia|
LS|Africa/Maseru|
LT|Europe/Vilnius|
LU|Europe/Luxembourg|
LV|Europe/Riga|
LY|Africa/Tripoli|
MA|Africa/Casablanca|
MC|Europe/Monaco|
MD|Europe/Chisinau|
ME|Europe/Podgorica|
MF|America/Marigot|
MG|Indian/Antananarivo|
MH|Pacific/Majuro|most of Marshall Islands
MH|Pacific/Kwajalein|Kwajalein
MK|Europe/Skopje|
ML|Africa/Bamako|
MM|Asia/Yangon|
MN|Asia/Ulaanbaatar|most of Mongolia
MN|Asia/Hovd|Bayan-Olgii, Hovd, Uvs
MO|Asia/Macau|
MP|Pacific/Saipan|
MQ|America/Martinique|
MR|Africa/Nouakchott|
MS|America/Montserrat|
MT|Europe/Malta|
MU|Indian/Mauritius|
MV|Indian/Maldives|
MW|Africa/Blantyre|
MX|America/Mexico_City|Central Mexico
MX|America/Cancun|Quintana Roo
MX|America/Merida|Campeche, Yucatan
MX|America/Monterrey|Durango; Coahuila, Nuevo Leon, Tamaulipas (most areas)
MX|America/Matamoros|Coahuila, Nuevo Leon, Tamaulipas (US border)
MX|America/Chihuahua|Chihuahua (most areas)
MX|America/Ciudad_Juarez|Chihuahua (US border - west)
MX|America/Ojinaga|Chihuahua (US border - east)
MX|America/Mazatlan|Baja California Sur, Nayarit (most areas), Sinaloa
MX|America/Bahia_Banderas|Bahia de Banderas
MX|America/Hermosillo|Sonora
MX|America/Tijuana|Baja California
MY|Asia/Kuala_Lumpur|Malaysia (peninsula)
MY|Asia/Kuching|Sabah, Sarawak
MZ|Africa/Maputo|
NA|Africa/Windhoek|
NC|Pacific/Noumea|
NE|Africa/Niamey|
NF|Pacific/Norfolk|
NG|Africa/Lagos|
NI|America/Managua|
NL|Europe/Amsterdam|
NO|Europe/Oslo|
NP|Asia/Kathmandu|
NR|Pacific/Nauru|
NU|Pacific/Niue|
NZ|Pacific/Auckland|most of New Zealand
NZ|Pacific/Chatham|Chatham Islands
OM|Asia/Muscat|
PA|America/Panama|
PE|America/Lima|
PF|Pacific/Tahiti|Society Islands
PF|Pacific/Marquesas|Marquesas Islands
PF|Pacific/Gambier|Gambier Islands
PG|Pacific/Port_Moresby|most of Papua New Guinea
PG|Pacific/Bougainville|Bougainville
PH|Asia/Manila|
PK|Asia/Karachi|
PL|Europe/Warsaw|
PM|America/Miquelon|
PN|Pacific/Pitcairn|
PR|America/Puerto_Rico|
PS|Asia/Gaza|Gaza Strip
PS|Asia/Hebron|West Bank
PT|Europe/Lisbon|Portugal (mainland)
PT|Atlantic/Madeira|Madeira Islands
PT|Atlantic/Azores|Azores
PW|Pacific/Palau|
PY|America/Asuncion|
QA|Asia/Qatar|
RE|Indian/Reunion|
RO|Europe/Bucharest|
RS|Europe/Belgrade|
RU|Europe/Kaliningrad|MSK-01 - Kaliningrad
RU|Europe/Moscow|MSK+00 - Moscow area
UA|Europe/Simferopol|Crimea
RU|Europe/Kirov|MSK+00 - Kirov
RU|Europe/Volgograd|MSK+00 - Volgograd
RU|Europe/Astrakhan|MSK+01 - Astrakhan
RU|Europe/Saratov|MSK+01 - Saratov
RU|Europe/Ulyanovsk|MSK+01 - Ulyanovsk
RU|Europe/Samara|MSK+01 - Samara, Udmurtia
RU|Asia/Yekaterinburg|MSK+02 - Urals
RU|Asia/Omsk|MSK+03 - Omsk
RU|Asia/Novosibirsk|MSK+04 - Novosibirsk
RU|Asia/Barnaul|MSK+04 - Altai
RU|Asia/Tomsk|MSK+04 - Tomsk
RU|Asia/Novokuznetsk|MSK+04 - Kemerovo
RU|Asia/Krasnoyarsk|MSK+04 - Krasnoyarsk area
RU|Asia/Irkutsk|MSK+05 - Irkutsk, Buryatia
RU|Asia/Chita|MSK+06 - Zabaykalsky
RU|Asia/Yakutsk|MSK+06 - Lena River
RU|Asia/Khandyga|MSK+06 - Tomponsky, Ust-Maysky
RU|Asia/Vladivostok|MSK+07 - Amur River
RU|Asia/Ust-Nera|MSK+07 - Oymyakonsky
RU|Asia/Magadan|MSK+08 - Magadan
RU|Asia/Sakhalin|MSK+08 - Sakhalin Island
RU|Asia/Srednekolymsk|MSK+08 - Sakha (E), N Kuril Is
RU|Asia/Kamchatka|MSK+09 - Kamchatka
RU|Asia/Anadyr|MSK+09 - Bering Sea
RW|Africa/Kigali|
SA|Asia/Riyadh|
SB|Pacific/Guadalcanal|
SC|Indian/Mahe|
SD|Africa/Khartoum|
SE|Europe/Stockholm|
SG|Asia/Singapore|
SH|Atlantic/St_Helena|
SI|Europe/Ljubljana|
SJ|Arctic/Longyearbyen|
SK|Europe/Bratislava|
SL|Africa/Freetown|
SM|Europe/San_Marino|
SN|Africa/Dakar|
SO|Africa/Mogadishu|
SR|America/Paramaribo|
SS|Africa/Juba|
ST|Africa/Sao_Tome|
SV|America/El_Salvador|
SX|America/Lower_Princes|
SY|Asia/Damascus|
SZ|Africa/Mbabane|
TC|America/Grand_Turk|
TD|Africa/Ndjamena|
TF|Indian/Kerguelen|
TG|Africa/Lome|
TH|Asia/Bangkok|
TJ|Asia/Dushanbe|
TK|Pacific/Fakaofo|
TL|Asia/Dili|
TM|Asia/Ashgabat|
TN|Africa/Tunis|
TO|Pacific/Tongatapu|
TR|Europe/Istanbul|
TT|America/Port_of_Spain|
TV|Pacific/Funafuti|
TW|Asia/Taipei|
TZ|Africa/Dar_es_Salaam|
UA|Europe/Kyiv|most of Ukraine
UG|Africa/Kampala|
UM|Pacific/Midway|Midway Islands
UM|Pacific/Wake|Wake Island
US|America/New_York|Eastern (most areas)
US|America/Detroit|Eastern - MI (most areas)
US|America/Kentucky/Louisville|Eastern - KY (Louisville area)
US|America/Kentucky/Monticello|Eastern - KY (Wayne)
US|America/Indiana/Indianapolis|Eastern - IN (most areas)
US|America/Indiana/Vincennes|Eastern - IN (Da, Du, K, Mn)
US|America/Indiana/Winamac|Eastern - IN (Pulaski)
US|America/Indiana/Marengo|Eastern - IN (Crawford)
US|America/Indiana/Petersburg|Eastern - IN (Pike)
US|America/Indiana/Vevay|Eastern - IN (Switzerland)
US|America/Chicago|Central (most areas)
US|America/Indiana/Tell_City|Central - IN (Perry)
US|America/Indiana/Knox|Central - IN (Starke)
US|America/Menominee|Central - MI (Wisconsin border)
US|America/North_Dakota/Center|Central - ND (Oliver)
US|America/North_Dakota/New_Salem|Central - ND (Morton rural)
US|America/North_Dakota/Beulah|Central - ND (Mercer)
US|America/Denver|Mountain (most areas)
US|America/Boise|Mountain - ID (south), OR (east)
US|America/Phoenix|MST - AZ (except Navajo)
US|America/Los_Angeles|Pacific
US|America/Anchorage|Alaska (most areas)
US|America/Juneau|Alaska - Juneau area
US|America/Sitka|Alaska - Sitka area
US|America/Metlakatla|Alaska - Annette Island
US|America/Yakutat|Alaska - Yakutat
US|America/Nome|Alaska (west)
US|America/Adak|Alaska - western Aleutians
US|Pacific/Honolulu|Hawaii
UY|America/Montevideo|
UZ|Asia/Samarkand|Uzbekistan (west)
UZ|Asia/Tashkent|Uzbekistan (east)
VA|Europe/Vatican|
VC|America/St_Vincent|
VE|America/Caracas|
VG|America/Tortola|
VI|America/St_Thomas|
VN|Asia/Ho_Chi_Minh|
VU|Pacific/Efate|
WF|Pacific/Wallis|
WS|Pacific/Apia|
YE|Asia/Aden|
YT|Indian/Mayotte|
ZA|Africa/Johannesburg|
ZM|Africa/Lusaka|
ZW|Africa/Harare|`

/** "Old/Name|Current/Name" per line: old or alias names that still work. */
export const ZONE_LINKS = `Australia/ACT|Australia/Sydney
Australia/LHI|Australia/Lord_Howe
Australia/NSW|Australia/Sydney
Australia/North|Australia/Darwin
Australia/Queensland|Australia/Brisbane
Australia/South|Australia/Adelaide
Australia/Tasmania|Australia/Hobart
Australia/Victoria|Australia/Melbourne
Australia/West|Australia/Perth
Australia/Yancowinna|Australia/Broken_Hill
Brazil/Acre|America/Rio_Branco
Brazil/DeNoronha|America/Noronha
Brazil/East|America/Sao_Paulo
Brazil/West|America/Manaus
Canada/Atlantic|America/Halifax
Canada/Central|America/Winnipeg
Canada/Eastern|America/Toronto
Canada/Mountain|America/Edmonton
Canada/Newfoundland|America/St_Johns
Canada/Pacific|America/Vancouver
Canada/Saskatchewan|America/Regina
Canada/Yukon|America/Whitehorse
Chile/Continental|America/Santiago
Chile/EasterIsland|Pacific/Easter
Mexico/BajaNorte|America/Tijuana
Mexico/BajaSur|America/Mazatlan
Mexico/General|America/Mexico_City
US/Alaska|America/Anchorage
US/Aleutian|America/Adak
US/Arizona|America/Phoenix
US/Central|America/Chicago
US/East-Indiana|America/Indiana/Indianapolis
US/Eastern|America/New_York
US/Hawaii|Pacific/Honolulu
US/Indiana-Starke|America/Indiana/Knox
US/Michigan|America/Detroit
US/Mountain|America/Denver
US/Pacific|America/Los_Angeles
US/Samoa|Pacific/Pago_Pago
America/Buenos_Aires|America/Argentina/Buenos_Aires
America/Catamarca|America/Argentina/Catamarca
America/Cordoba|America/Argentina/Cordoba
America/Indianapolis|America/Indiana/Indianapolis
America/Jujuy|America/Argentina/Jujuy
America/Knox_IN|America/Indiana/Knox
America/Louisville|America/Kentucky/Louisville
America/Mendoza|America/Argentina/Mendoza
America/Virgin|America/Puerto_Rico
Pacific/Samoa|Pacific/Pago_Pago
Africa/Accra|Africa/Abidjan
Africa/Addis_Ababa|Africa/Nairobi
Africa/Asmara|Africa/Nairobi
Africa/Bamako|Africa/Abidjan
Africa/Bangui|Africa/Lagos
Africa/Banjul|Africa/Abidjan
Africa/Blantyre|Africa/Maputo
Africa/Brazzaville|Africa/Lagos
Africa/Bujumbura|Africa/Maputo
Africa/Conakry|Africa/Abidjan
Africa/Dakar|Africa/Abidjan
Africa/Dar_es_Salaam|Africa/Nairobi
Africa/Djibouti|Africa/Nairobi
Africa/Douala|Africa/Lagos
Africa/Freetown|Africa/Abidjan
Africa/Gaborone|Africa/Maputo
Africa/Harare|Africa/Maputo
Africa/Kampala|Africa/Nairobi
Africa/Kigali|Africa/Maputo
Africa/Kinshasa|Africa/Lagos
Africa/Libreville|Africa/Lagos
Africa/Lome|Africa/Abidjan
Africa/Luanda|Africa/Lagos
Africa/Lubumbashi|Africa/Maputo
Africa/Lusaka|Africa/Maputo
Africa/Malabo|Africa/Lagos
Africa/Maseru|Africa/Johannesburg
Africa/Mbabane|Africa/Johannesburg
Africa/Mogadishu|Africa/Nairobi
Africa/Niamey|Africa/Lagos
Africa/Nouakchott|Africa/Abidjan
Africa/Ouagadougou|Africa/Abidjan
Africa/Porto-Novo|Africa/Lagos
America/Anguilla|America/Puerto_Rico
America/Antigua|America/Puerto_Rico
America/Aruba|America/Puerto_Rico
America/Atikokan|America/Panama
America/Blanc-Sablon|America/Puerto_Rico
America/Cayman|America/Panama
America/Creston|America/Phoenix
America/Curacao|America/Puerto_Rico
America/Dominica|America/Puerto_Rico
America/Grenada|America/Puerto_Rico
America/Guadeloupe|America/Puerto_Rico
America/Kralendijk|America/Puerto_Rico
America/Lower_Princes|America/Puerto_Rico
America/Marigot|America/Puerto_Rico
America/Montserrat|America/Puerto_Rico
America/Nassau|America/Toronto
America/Port_of_Spain|America/Puerto_Rico
America/St_Barthelemy|America/Puerto_Rico
America/St_Kitts|America/Puerto_Rico
America/St_Lucia|America/Puerto_Rico
America/St_Thomas|America/Puerto_Rico
America/St_Vincent|America/Puerto_Rico
America/Tortola|America/Puerto_Rico
Antarctica/DumontDUrville|Pacific/Port_Moresby
Antarctica/McMurdo|Pacific/Auckland
Antarctica/Syowa|Asia/Riyadh
Arctic/Longyearbyen|Europe/Berlin
Asia/Aden|Asia/Riyadh
Asia/Bahrain|Asia/Qatar
Asia/Brunei|Asia/Kuching
Asia/Kuala_Lumpur|Asia/Singapore
Asia/Kuwait|Asia/Riyadh
Asia/Muscat|Asia/Dubai
Asia/Phnom_Penh|Asia/Bangkok
Asia/Vientiane|Asia/Bangkok
Atlantic/Reykjavik|Africa/Abidjan
Atlantic/St_Helena|Africa/Abidjan
Europe/Amsterdam|Europe/Brussels
Europe/Bratislava|Europe/Prague
Europe/Busingen|Europe/Zurich
Europe/Copenhagen|Europe/Berlin
Europe/Guernsey|Europe/London
Europe/Isle_of_Man|Europe/London
Europe/Jersey|Europe/London
Europe/Ljubljana|Europe/Belgrade
Europe/Luxembourg|Europe/Brussels
Europe/Mariehamn|Europe/Helsinki
Europe/Monaco|Europe/Paris
Europe/Oslo|Europe/Berlin
Europe/Podgorica|Europe/Belgrade
Europe/San_Marino|Europe/Rome
Europe/Sarajevo|Europe/Belgrade
Europe/Skopje|Europe/Belgrade
Europe/Stockholm|Europe/Berlin
Europe/Vaduz|Europe/Zurich
Europe/Vatican|Europe/Rome
Europe/Zagreb|Europe/Belgrade
Indian/Antananarivo|Africa/Nairobi
Indian/Christmas|Asia/Bangkok
Indian/Cocos|Asia/Yangon
Indian/Comoro|Africa/Nairobi
Indian/Kerguelen|Indian/Maldives
Indian/Mahe|Asia/Dubai
Indian/Mayotte|Africa/Nairobi
Indian/Reunion|Asia/Dubai
Pacific/Chuuk|Pacific/Port_Moresby
Pacific/Funafuti|Pacific/Tarawa
Pacific/Majuro|Pacific/Tarawa
Pacific/Midway|Pacific/Pago_Pago
Pacific/Pohnpei|Pacific/Guadalcanal
Pacific/Saipan|Pacific/Guam
Pacific/Wake|Pacific/Tarawa
Pacific/Wallis|Pacific/Tarawa
Africa/Timbuktu|Africa/Abidjan
America/Argentina/ComodRivadavia|America/Argentina/Catamarca
America/Atka|America/Adak
America/Coral_Harbour|America/Panama
America/Ensenada|America/Tijuana
America/Fort_Wayne|America/Indiana/Indianapolis
America/Montreal|America/Toronto
America/Nipigon|America/Toronto
America/Pangnirtung|America/Iqaluit
America/Porto_Acre|America/Rio_Branco
America/Rainy_River|America/Winnipeg
America/Rosario|America/Argentina/Cordoba
America/Santa_Isabel|America/Tijuana
America/Shiprock|America/Denver
America/Thunder_Bay|America/Toronto
America/Yellowknife|America/Edmonton
Antarctica/South_Pole|Pacific/Auckland
Asia/Choibalsan|Asia/Ulaanbaatar
Asia/Chongqing|Asia/Shanghai
Asia/Harbin|Asia/Shanghai
Asia/Kashgar|Asia/Urumqi
Asia/Tel_Aviv|Asia/Jerusalem
Atlantic/Jan_Mayen|Europe/Berlin
Australia/Canberra|Australia/Sydney
Australia/Currie|Australia/Hobart
Europe/Belfast|Europe/London
Europe/Tiraspol|Europe/Chisinau
Europe/Uzhgorod|Europe/Kyiv
Europe/Zaporozhye|Europe/Kyiv
Pacific/Enderbury|Pacific/Kanton
Pacific/Johnston|Pacific/Honolulu
Pacific/Yap|Pacific/Port_Moresby
Africa/Asmera|Africa/Nairobi
America/Godthab|America/Nuuk
Asia/Ashkhabad|Asia/Ashgabat
Asia/Calcutta|Asia/Kolkata
Asia/Chungking|Asia/Shanghai
Asia/Dacca|Asia/Dhaka
Asia/Istanbul|Europe/Istanbul
Asia/Katmandu|Asia/Kathmandu
Asia/Macao|Asia/Macau
Asia/Rangoon|Asia/Yangon
Asia/Saigon|Asia/Ho_Chi_Minh
Asia/Thimbu|Asia/Thimphu
Asia/Ujung_Pandang|Asia/Makassar
Asia/Ulan_Bator|Asia/Ulaanbaatar
Atlantic/Faeroe|Atlantic/Faroe
Europe/Kiev|Europe/Kyiv
Europe/Nicosia|Asia/Nicosia
Pacific/Ponape|Pacific/Guadalcanal
Pacific/Truk|Pacific/Port_Moresby`
