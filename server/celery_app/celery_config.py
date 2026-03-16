from celery.schedules import crontab

# Celery Beat Schedule
# Timezone is set to 'Europe/Madrid' in celery_utils.py
beat_schedule = {
     'import-annotations-daily': {
        'task': 'import_annotations',  # Task name as defined in @shared_task decorator
        'schedule': crontab(day_of_week=6, hour=0, minute=0),  # Every Saturday at midnight
        'options': {'expires': 3600}  # Expire after 1 hour if not started
    },
    'update-records': {
        'task': 'update_records',  # Task name as defined in @shared_task decorator
        'schedule': crontab(day_of_week=0, hour=3, minute=0),  # Every Sunday at 03:00
        'options': {'expires': 3600}  # Expire after 1 hour if not started
    },
    'track-unique-users-by-country-daily': {
        'task': 'track_unique_users_by_country',  # Task name as defined in @shared_task decorator
        'schedule': crontab(hour=0, minute=0),  # Every day at midnight
        'options': {'expires': 3600}  # Expire after 1 hour if not started
    },
    'update-busco-scores': {
        'task': 'update_busco_scores',  # Task name as defined in @shared_task decorator
        'schedule': crontab(day_of_week=0, hour=4, minute=0),  # Every Sunday at 04:00
        'options': {'expires': 3600}  # Expire after 1 hour if not started
    },
} 