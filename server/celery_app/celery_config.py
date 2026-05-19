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
    'export-flattened-taxonomy-daily': {
        'task': 'export_flattened_taxonomy',
        'schedule': crontab(hour=2, minute=30),  # Daily 02:30 Europe/Madrid
        'options': {'expires': 3600},
    },
    'prune-annotations-missing-source-url-monthly': {
        'task': 'prune_annotations_missing_source_url',
        # Second week of each month: Monday on days 8–14, 05:00 Europe/Madrid
        'schedule': crontab(day_of_month='8-14', day_of_week=1, hour=5, minute=0),
        'kwargs': {'dry_run': False},
        'options': {'expires': 7200},
    },
} 