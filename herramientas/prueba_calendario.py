"""Prueba de calendario.py: la próxima Cacería a partir de una fecha (con los cambios de hora de Madrid) y el
Event de schema.org de la página de la Cacería. No necesita la web montada.

Uso: python herramientas/prueba_calendario.py
"""
import datetime as dt
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import calendario as c  # noqa: E402

sys.stdout.reconfigure(encoding='utf-8')

fallos = 0


def prueba(nombre, comprobar):
    global fallos
    try:
        comprobar()
        print('ok   ', nombre)
    except AssertionError as e:
        fallos += 1
        print('FALLO', nombre, '→', e)


def inicio_iso(desde, cac=None):
    cac = cac or c.datos()
    inicio, _ = c.proxima(cac, dt.date.fromisoformat(desde))
    return inicio.isoformat()


# [fecha de referencia, inicio esperado]. Los esperados, a mano del calendario de 2026 a 2030.
PROXIMAS = [
    ('lunes: el sábado de esa semana', '2026-11-02', '2026-11-07T22:00:00'),
    ('el mismo sábado: cuenta ese día', '2026-11-07', '2026-11-07T22:00:00'),
    ('el domingo siguiente: la del otro sábado', '2026-11-08', '2026-11-14T22:00:00'),
    ('el viernes de antes', '2026-11-06', '2026-11-07T22:00:00'),
    ('antes de la primera: la primera', '2026-10-20', '2026-10-31T22:00:00'),
    ('el día de la primera', '2026-10-31', '2026-10-31T22:00:00'),
    ('fin de año', '2026-12-31', '2027-01-02T22:00:00'),
    ('mucho después', '2030-01-01', '2030-01-05T22:00:00'),
]
def proxima_es(desde, esperado):
    def comprobar():
        obtenido = inicio_iso(desde)
        assert obtenido == esperado, f'desde {desde}: {obtenido} y debía ser {esperado}'
    return comprobar


for nombre, desde, esperado in PROXIMAS:
    prueba(f'próxima Cacería: {nombre}', proxima_es(desde, esperado))


def duracion():
    inicio, fin = c.proxima(c.datos(), dt.date(2026, 11, 2))
    assert fin - inicio == dt.timedelta(minutes=60), fin - inicio


prueba('dura lo que dice datos_clan.json', duracion)


def evento_con_hora_de_invierno():
    e = c.evento('es', 'https://ejemplo.test/web/', 'https://discord.test/x', dt.date(2026, 11, 2))
    assert e['startDate'] == '2026-11-07T22:00:00+01:00', e['startDate']
    assert e['endDate'] == '2026-11-07T23:00:00+01:00', e['endDate']


def evento_con_hora_de_verano():
    # Primer sábado tras el cambio de hora de 2027 (domingo 28 de marzo): 22:00 en CEST, UTC+2.
    e = c.evento('en', 'https://ejemplo.test/web/', 'https://discord.test/x', dt.date(2027, 3, 28))
    assert e['startDate'] == '2027-04-03T22:00:00+02:00', e['startDate']
    assert e['endDate'] == '2027-04-03T23:00:00+02:00', e['endDate']


def evento_el_sabado_del_cambio_de_hora():
    # Sábado 27 de marzo de 2027, la víspera del cambio: aún UTC+1.
    e = c.evento('es', 'https://ejemplo.test/web/', 'https://discord.test/x', dt.date(2027, 3, 27))
    assert e['startDate'] == '2027-03-27T22:00:00+01:00', e['startDate']


prueba('el Event lleva la hora de invierno de Madrid', evento_con_hora_de_invierno)
prueba('el Event lleva la hora de verano de Madrid', evento_con_hora_de_verano)
prueba('el Event de la víspera del cambio de hora', evento_el_sabado_del_cambio_de_hora)


def evento_completo():
    e = c.evento('en', 'https://ejemplo.test/web/', 'https://discord.test/x', dt.date(2026, 11, 2))
    assert e['@type'] == 'Event' and e['@id'] == 'https://ejemplo.test/web/en/hunt/#evento' and e['url'] == 'https://ejemplo.test/web/en/hunt/', (e['@id'], e['url'])
    assert e['name'] == 'Clan hunt · GARRA IBÉRICA' and e['inLanguage'] == 'en'
    assert e['eventStatus'] == 'https://schema.org/EventScheduled'
    assert e['eventAttendanceMode'] == 'https://schema.org/OnlineEventAttendanceMode'
    assert e['location'] == {'@type': 'VirtualLocation', 'name': 'Discord · Cacería 1 voice channel', 'url': 'https://discord.test/x'}, e['location']
    assert e['organizer'] == {'@id': 'https://ejemplo.test/web/#clan'} and e['isAccessibleForFree'] is True
    assert e['eventSchedule'] == {'@type': 'Schedule', 'repeatFrequency': 'P1W', 'byDay': 'https://schema.org/Saturday',
                                  'startTime': '22:00:00', 'duration': 'PT60M', 'scheduleTimezone': 'Europe/Madrid'}, e['eventSchedule']
    assert 'Every Saturday at 22:00 Spanish mainland time' in e['description'] and 'https://ejemplo.test/web/en/' in e['description']


prueba('el Event trae lo que necesita Google y el horario semanal', evento_completo)


def primera_mal_puesta():
    cac = {**c.datos(), 'primera': '2026-11-01'}
    try:
        c.proxima(cac, dt.date(2026, 11, 2))
    except ValueError:
        return
    raise AssertionError('acepta una «primera» que no cae en sábado')


prueba('una «primera» que no es sábado se rechaza', primera_mal_puesta)

print(f'{fallos} fallos' if fallos else 'Todo correcto')
sys.exit(1 if fallos else 0)
