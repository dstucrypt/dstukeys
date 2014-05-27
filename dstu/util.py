import base64

def pem_to_der(pem):
    b64 = []
    out = True
    lines = pem.split('\n')
    for line in lines:
        if line.startswith('-----'):
            if out:
                out = False
                continue
            else:
                break
        elif out:
            continue

        b64.append(line)

    return base64.b64decode(str.join('',b64))


def der_to_pem(der, name):
    parts = [
        '-----BEGIN {}-----'.format(name),
        base64.b64encode(der),
        '-----END {}-----'.format(name),
    ]
    return str.join('\n', parts)
