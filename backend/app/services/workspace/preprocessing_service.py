from typing import List, Optional
from beanie import PydanticObjectId
from app.models.workspace.preprocessing import Preprocessing
from app.schemas.preprocessing import PreprocessingCreate, PreprocessingUpdate
from datetime import datetime

class PreprocessingService:
    async def create_preprocessing(self, workspace_id: str, data: PreprocessingCreate) -> Preprocessing:
        preprocessing = Preprocessing(
            workspace_id=PydanticObjectId(workspace_id),
            **data.model_dump()
        )
        await preprocessing.insert()
        return preprocessing

    async def get_all_by_workspace(self, workspace_id: str) -> List[Preprocessing]:
        return await Preprocessing.find(Preprocessing.workspace_id == PydanticObjectId(workspace_id)).to_list()

    async def get_preprocessing(self, preprocessing_id: str) -> Optional[Preprocessing]:
        return await Preprocessing.get(PydanticObjectId(preprocessing_id))

    async def update_preprocessing(self, preprocessing_id: str, data: PreprocessingUpdate) -> Optional[Preprocessing]:
        preprocessing = await self.get_preprocessing(preprocessing_id)
        if not preprocessing:
            return None
        
        update_data = data.model_dump(exclude_unset=True)
        if not update_data:
            return preprocessing
            
        update_data["updated_at"] = datetime.utcnow()
        await preprocessing.update({"$set": update_data})
        return preprocessing

    async def delete_preprocessing(self, preprocessing_id: str) -> bool:
        preprocessing = await self.get_preprocessing(preprocessing_id)
        if not preprocessing:
            return False
        await preprocessing.delete()
        return True
