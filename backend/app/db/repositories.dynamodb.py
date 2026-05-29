import logging
import boto3
from botocore.exceptions import ClientError
from app.schemas import GameState

logger = logging.getLogger(__name__)

# Verbindung zum sturen Lagerhaus (DynamoDB) herstellen
# (Tabellenname kommt dynamisch aus der Umgebungsvariable, Fallback auf fatchad_game_data)
DYNAMODB_TABLE = os.environ.get('GAME_DATA_TABLE', 'fatchad_game_data')
dynamodb = boto3.resource('dynamodb', region_name='eu-central-1')
table = dynamodb.Table(DYNAMODB_TABLE)

class GameStateRepo:
    """Read-write access to the single-table DynamoDB for player runs."""

    def __init__(self):
        # Wir brauchen keine Mongo-DB-Verbindung mehr übergeben, boto3 regelt das global
        pass

    async def get_active_run(self, user_id: str) -> GameState | None:
        """Holt den aktuell laufenden Run des Users aus dem Regal."""
        try:
            response = table.get_item(
                Key={
                    'PK': f"USER#{user_id}",
                    'SK': f"RUN#ACTIVE#{run_id}"
                }
            )
            item = response.get('Item')
            if not item:
                return None
                
            # Wir säubern das Item von den technischen NoSQL-Keys (PK, SK)
            item.pop('PK', None)
            item.pop('SK', None)
            
            # Das Gehirn (Pydantic) baut daraus wieder ein schönes Objekt für die Logik
            return GameState.model_validate(item)
            
        except Exception as exc:
            logger.error("Failed to fetch active GameState for user '%s': %s", user_id, exc)
            return None

    async def save(self, state: GameState) -> None:
        """Speichert den aktuellen Spielstand. Überschreibt den alten Zustand stur."""
        # Das Pydantic-Modell wird in ein flaches JSON/Dict umgewandelt
        data = state.model_dump(by_alias=True)
        
        # Datetime-Objekte mag DynamoDB nicht, wir wandeln sie fix in ISO-Strings um
        data['created_at'] = state.created_at.isoformat()
        data['updated_at'] = state.updated_at.isoformat()
        
        # Wir kleben die Etiketten für das Single-Table-Design drauf!
        data['PK'] = f"USER#{state.user_id}"
        data['SK'] = f"RUN#ACTIVE#{state.id}"
        
        try:
            table.put_item(Item=data)
        except ClientError as exc:
            logger.error("Failed to save GameState for user '%s': %s", state.user_id, exc)
            raise exc

    async def abandon_and_archive_run(self, user_id: str) -> bool:
        """
        GENAU UNSERE LOGIK: Löscht RUN#ACTIVE, ändert Status auf 'abandoned'
        und speichert es als RUN#INACTIVE#<run_id> wieder ab.
        """
        try:
            # 1. Aktiven Run holen
            response = table.get_item(
                Key={
                    'PK': f"USER#{user_id}", 
                    'SK': f"RUN#ACTIVE#{run_id}"
                }
            )
            item = response.get('Item')
            
            if not item:
                return False
                
            run_id = item.get('id', 'unknown')
            
            # 2. JSON-Manipulation im Backend-Gehirn
            item['status'] = 'abandoned'
            item['SK'] = f"RUN#INACTIVE#{run_id}" # Neues Etikett aufkleben
            
            # 3. Altes wegschmeißen, Neues ins Regal schieben
            table.put_item(Item=item)
            table.delete_item(Key={'PK': f"USER#{user_id}", f"RUN#INACTIVE#{run_id}"})
            
            return True
        except ClientError as exc:
            logger.error("Failed to abandon run for user '%s': %s", user_id, exc)
            return False

    async def list_history_for_user(self, user_id: str) -> list[dict]:
        try:
            response = table.query(
                KeyConditionExpression="PK = :pk AND begins_with(SK, :sk)",
                ExpressionAttributeValues={
                    ":pk": f"USER#{user_id}",
                    ":sk": "RUN#ACTIVE#"
                }
            )
            return response.get('Items', [])
        except ClientError as exc:
            logger.error("Failed to list run history for user '%s': %s", user_id, exc)
            return []