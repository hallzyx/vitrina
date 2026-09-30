"""Entry point of the pipeline Lambda: Step Functions passes {"task": "<name>", ...} and this routes it."""
import logging

import tasks
from core import PipelineError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

TASKS = {
    "validate": tasks.validate,
    "process_photo": tasks.process_photo,
    "align": tasks.align,
    "fidelity": tasks.fidelity,
    "brand": tasks.brand,
    "listing": tasks.listing,
    "finalize": tasks.finalize,
    "fail": tasks.fail,
}


def handler(event, context):
    task = event.get("task")
    if task not in TASKS:
        raise PipelineError("internal_error", f"Unknown task: {task}")
    # Only ids and the task name are logged: never image data, keys of other users or model answers.
    logger.info("task=%s store=%s product=%s", task, event.get("storeId"), event.get("productId"))
    return TASKS[task](event)
