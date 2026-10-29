"""Genera el calendario de la Cacería (docs/caceria.ics y docs/en/caceria.ics) y el enlace para
añadirla a Google Calendar, a partir de herramientas/datos_clan.json y de la dirección canónica
de la web. comprobar.py exige que los ficheros y los enlaces de las páginas coincidan con esto.

Uso: python herramientas/calendario.py   (después de cambiar la hora o la dirección de la web)
"""
import datetime as dt
import json
import re
from pathlib import Path
from urllib.parse import quote

RAIZ = Path(__file__).resolve().parent.parent
DOCS = RAIZ / 'docs'
DATOS = Path(__file__).resolve().parent / 'datos_clan.json'
FICHEROS = {'es': 'caceria.ics', 'en': 'en/caceria.ics'}
DIAS_ICS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
TEXTOS = {
    'es': {
        'titulo': 'Cacería del clan · GARRA IBÉRICA',
        'lugar': 'Discord · voz de caza',
        'descripcion': 'Cada sábado a las {hora} (hora peninsular española), en el canal de voz de caza '
                       'del Discord del clan. Necesitas ser al menos Recluta. {web}',
        'aviso': 'La Cacería del clan empieza en 30 minutos',
    },
    'en': {
        'titulo': 'Clan hunt · GARRA IBÉRICA',
        'lugar': 'Discord · hunt voice channel',
        'descripcion': 'Every Saturday at {hora} Spanish mainland time, in the hunt voice channel of the '
                       'clan Discord. You need at least the Recluta (Recruit) rank. {web}',
        'aviso': 'The clan hunt starts in 30 minutes',
    },
}
# Reglas de horario de verano de Europa (Madrid): desde 1996, último domingo de marzo y de octubre.
ZONA_MADRID = [
    'BEGIN:VTIMEZONE', 'TZID:Europe/Madrid',
    'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST',
    'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
    'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET',
    'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
    'END:VTIMEZONE',
]


def datos():
    return json.loads(DATOS.read_text(encoding='utf-8'))['caceria']


def base_web():
    canon = re.search(r'<link rel="canonical" href="([^"]+)"', (DOCS / 'index.html').read_text(encoding='utf-8'))
    return canon.group(1)


def tramo(cac):
    """Inicio y fin de la primera Cacería, en hora de pared de la zona del clan."""
    inicio = dt.datetime.combine(dt.date.fromisoformat(cac['primera']), dt.time(cac['hora']))
    if inicio.isoweekday() % 7 != cac['dia_semana']:
        raise ValueError(f'«primera» ({cac["primera"]}) no cae en el día de la Cacería')
    return inicio, inicio + dt.timedelta(minutes=cac['duracion_min'])


def regla(cac):
    return f'FREQ=WEEKLY;BYDAY={DIAS_ICS[cac["dia_semana"]]}'


def descripcion(lang, cac, base):
    web = base + ('en/' if lang == 'en' else '')
    return TEXTOS[lang]['descripcion'].format(hora=f'{cac["hora"]:02d}:00', web=web)


def escapar(texto):
    return texto.replace('\\', '\\\\').replace(';', '\\;').replace(',', '\\,').replace('\n', '\\n')


def plegar(linea):
    """Corta las líneas de más de 75 bytes como pide el formato iCalendar (RFC 5545), sin partir
    caracteres de varios bytes."""
    partes, actual, limite = [], '', 75
    for c in linea:
        if len((actual + c).encode('utf-8')) > limite:
            partes.append(actual)
            actual, limite = c, 74
        else:
            actual += c
    partes.append(actual)
    return '\r\n '.join(partes)


def ics(lang, base=None):
    base = base or base_web()
    cac = datos()
    if cac['zona'] != 'Europe/Madrid':
        raise ValueError('ZONA_MADRID solo describe Europe/Madrid: actualízala si cambia la zona')
    inicio, _ = tramo(cac)
    t = TEXTOS[lang]
    lineas = [
        'BEGIN:VCALENDAR', 'VERSION:2.0', f'PRODID:-//GARRA IBERICA//Caceria//{lang.upper()}',
        'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
        *ZONA_MADRID,
        'BEGIN:VEVENT',
        f'UID:caceria-semanal-{lang}@garra-iberica',
        f'DTSTAMP:{inicio:%Y%m%d}T000000Z',
        f'DTSTART;TZID={cac["zona"]}:{inicio:%Y%m%dT%H%M%S}',
        f'DURATION:PT{cac["duracion_min"]}M',
        f'RRULE:{regla(cac)}',
        f'SUMMARY:{escapar(t["titulo"])}',
        f'DESCRIPTION:{escapar(descripcion(lang, cac, base))}',
        f'LOCATION:{escapar(t["lugar"])}',
        f'URL:{base}{"en/" if lang == "en" else ""}#{"hunt" if lang == "en" else "caceria"}',
        'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-PT30M', f'DESCRIPTION:{escapar(t["aviso"])}', 'END:VALARM',
        'END:VEVENT', 'END:VCALENDAR',
    ]
    return ''.join(plegar(l) + '\r\n' for l in lineas)


def enlace_google(lang, base=None):
    """Enlace a Google Calendar tal como va escrito en el HTML (con &amp;)."""
    base = base or base_web()
    cac = datos()
    inicio, fin = tramo(cac)
    partes = [
        ('action', 'TEMPLATE'),
        ('text', TEXTOS[lang]['titulo']),
        ('dates', f'{inicio:%Y%m%dT%H%M%S}/{fin:%Y%m%dT%H%M%S}'),
        ('ctz', cac['zona']),
        ('recur', f'RRULE:{regla(cac)}'),
        ('details', descripcion(lang, cac, base)),
        ('location', TEXTOS[lang]['lugar']),
    ]
    return 'https://calendar.google.com/calendar/render?' + '&amp;'.join(f'{k}={quote(v, safe="")}' for k, v in partes)


if __name__ == '__main__':
    for lang, nombre in FICHEROS.items():
        (DOCS / nombre).write_bytes(ics(lang).encode('utf-8'))
        print(f'docs/{nombre} escrito')
    for lang in FICHEROS:
        print(f'Enlace de Google Calendar ({lang}):', enlace_google(lang))
