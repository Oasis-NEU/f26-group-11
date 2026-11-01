from fastapi import APIRouter, HTTPException, status

from app.deps import CommunityRepoDep
from app.schemas.communities import CommunityOut

router = APIRouter(prefix="/communities", tags=["communities"])


@router.get("")
def list_communities(repo: CommunityRepoDep) -> list[CommunityOut]:
    return repo.list_all()


@router.get("/{slug}")
def get_community(slug: str, repo: CommunityRepoDep) -> CommunityOut:
    community = repo.get_by_slug(slug)
    if community is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Community not found")
    return community