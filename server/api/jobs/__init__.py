from fastapi import APIRouter

from api.jobs import assemblies, migration, taxonomy, updates

router = APIRouter()
router.include_router(taxonomy.router)
router.include_router(assemblies.router)
router.include_router(migration.router)
router.include_router(updates.router)
