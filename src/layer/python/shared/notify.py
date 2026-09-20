import os
from . import db


def send_sms(phone, message):
    if not phone:
        return False
    try:
        db._client("sns").publish(
            PhoneNumber=phone,
            Message=message,
            MessageAttributes={
                "AWS.SNS.SMS.SenderID": {
                    "DataType": "String",
                    "StringValue": os.environ.get("SMS_SENDER_ID", "RAKTA"),
                },
                "AWS.SNS.SMS.SMSType": {
                    "DataType": "String",
                    "StringValue": "Transactional",
                },
            },
        )
        return True
    except Exception as exc:
        print(f"sms_failed phone={phone} err={exc}")
        return False


def notify_donor(donor, message):
    return send_sms(donor.get("phone"), message)


def notify_requester(phone, message):
    return send_sms(phone, message)