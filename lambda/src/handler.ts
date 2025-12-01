import {APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult} from 'aws-lambda'

const ALLOWED_FLAVORS = ['vanilla', 'chocolate', 'strawberry', 'mint', 'cookie-dough'] as const

type Flavor = typeof ALLOWED_FLAVORS[number]

export interface SurveyInput {
  flavor: Flavor
}

function corsHeaders(origin: string | undefined) {
  // Allow all origins for demo; tighten in prod
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'OPTIONS,POST',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const bodyRaw = event.body ?? ''
    let body: SurveyInput
    try {
      body = JSON.parse(bodyRaw)
    } catch (error) {
      console.error('Unable to parse body raw', error)
      return {
        statusCode: 400,
        headers: corsHeaders(event.headers?.origin || event.headers?.Origin),
        body: ''
      }
    }

    if (!body.flavor || !ALLOWED_FLAVORS.includes(body.flavor)) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders(event.headers?.origin || event.headers?.Origin),
        },
        body: JSON.stringify({ error: 'Invalid flavor', allowed: ALLOWED_FLAVORS }),
      }
    }

    const message = `Yum! You picked ${body.flavor} 🍨`

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders(event.headers?.origin || event.headers?.Origin),
      },
      body: JSON.stringify({ ok: true, message }),
    }
  } catch (err) {
    console.error('Error handling request', err)
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders(event.headers?.origin || event.headers?.Origin),
      },
      body: JSON.stringify({ error: 'Server error' }),
    }
  }
}
