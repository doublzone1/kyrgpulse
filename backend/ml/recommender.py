import numpy as np
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from models.apartment import Apartment
from sklearn.metrics.pairwise import cosine_similarity


class Recommender:
    async def get_similar(self, db: AsyncSession, target: dict, top_k: int = 5):
        query = select(Apartment)
        result = await db.execute(query)
        apts = result.scalars().all()
        target_id = target.get("id") or target.get("apartment_id")

        candidates = [
            apt for apt in apts
            if apt.id != target_id
            and apt.rooms is not None
            and apt.total_area is not None
            and apt.price is not None
        ]

        if len(candidates) < 2:
            return []

        vectors = np.array([
            [apt.rooms or 0, apt.total_area or 0, apt.price or 0]
            for apt in candidates
        ], dtype=float)

        target_vec = np.array([[
            target.get('rooms', 0),
            target.get('total_area', 0),
            target.get('price', 0)
        ]], dtype=float)

        scale = vectors.std(axis=0)
        scale[scale == 0] = 1
        center = vectors.mean(axis=0)
        vectors = (vectors - center) / scale
        target_vec = (target_vec - center) / scale

        sim = cosine_similarity(target_vec, vectors)[0]
        top_indices = np.argsort(sim)[::-1][:top_k]

        recommendations = []
        for idx in top_indices:
            apt = candidates[idx]
            recommendations.append({
                "apartment_id": apt.id,
                "title": apt.title,
                "price": apt.price,
                "similarity_score": round(float(sim[idx]), 3),
                "link": apt.link
            })

        return recommendations
