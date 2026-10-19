"""The starting cluster file: every document put in one of 10 topic clusters by its name, for a person to
review (spec user stories 15-16). Specific domains go to architecture / process, CSRF to the browser."""

from __future__ import annotations

from .schema import ClusterId, ClusterMap, Manifest

WSTG_KEY = "wstg-v4.2"

CLUSTER_NAMES: dict[ClusterId, str] = {
    "arch": "Kiến trúc, quy trình (gồm miền đặc thù)",
    "supply": "Chuỗi cung ứng, DevOps, hạ tầng",
    "inj": "Injection, đầu vào",
    "auth": "Xác thực, phiên",
    "browser": "Trình duyệt (gồm CSRF)",
    "framework": "Framework, ngôn ngữ",
    "ai": "AI",
    "transport": "Vận chuyển, header, mật mã",
    "authz": "Phân quyền",
    "api": "API",
}

#: Cheat sheet name (doc_key without "_Cheat_Sheet") → cluster. Checked in order is not needed: names are exact.
RULES: dict[ClusterId, list[str]] = {
    "auth": [
        "Authentication", "Authentication_Patterns", "Multifactor_Authentication", "Passkey_Security", "Password_Storage",
        "Forgot_Password", "Credential_Stuffing_Prevention", "Session_Management", "Choosing_and_Using_Security_Questions",
        "Cookie_Theft_Mitigation", "JSON_Web_Token", "OAuth2", "SAML_Security", "Identity_Propagation_Patterns",
        "Workload_Identity_Federation", "Email_Validation_and_Verification", "JAAS",
    ],
    "authz": [
        "Authorization", "Authorization_Patterns", "Authorization_Decisions_And_Output_Handling",
        "Authorization_Policy_And_Data_Distribution", "Authorization_Regression_Testing", "Authorization_Testing_Automation",
        "Insecure_Direct_Object_Reference_Prevention", "Mass_Assignment", "Transaction_Authorization", "Multi_Tenant_Security",
    ],
    "inj": [
        "SQL_Injection_Prevention", "Query_Parameterization", "Injection_Prevention", "OS_Command_Injection_Defense",
        "LDAP_Injection_Prevention", "XPath_Injection_Prevention", "NoSQL_Security", "Server_Side_Template_Injection_Prevention",
        "XML_External_Entity_Prevention", "XML_Security", "Deserialization", "Prototype_Pollution_Prevention", "Input_Validation",
        "Bean_Validation", "File_Upload", "Server_Side_Request_Forgery_Prevention", "Unvalidated_Redirects_and_Forwards",
    ],
    "browser": [
        "Cross_Site_Scripting_Prevention", "DOM_based_XSS_Prevention", "XSS_Filter_Evasion", "DOM_Clobbering_Prevention",
        "Content_Security_Policy", "Clickjacking_Defense", "HTML5_Security", "XS_Leaks", "Third_Party_Javascript_Management",
        "Browser_Extension_Vulnerabilities", "Web_Frontend_Security", "Micro_Frontend_Security",
        "Cross-Site_Request_Forgery_Prevention",
    ],
    "framework": [
        "DotNet_Security", "Java_Security", "Nodejs_Security", "Django_Security", "Django_REST_Framework", "Laravel", "Symfony",
        "Ruby_on_Rails", "PHP_Configuration", "FastAPI_Security", "Nextjs_Security", "JavaScript_and_TypeScript_Security",
        "C-Based_Toolchain_Hardening",
    ],
    "ai": [
        "AI_Agent_Security", "AI-Powered_Advertising_Systems_Security", "AML_Sanctions_AI_Agent_Payments",
        "LLM_Prompt_Injection_Prevention", "MCP_Security", "RAG_Security", "Secure_AI_Model_Ops", "Secure_Coding_with_AI",
        "Verifying_Third_Party_Agent_Execution_Evidence",
    ],
    "transport": [
        "Transport_Layer_Security", "HTTP_Strict_Transport_Security", "HTTP_Headers", "Pinning", "Cryptographic_Storage",
        "Key_Management", "Post_Quantum_Cryptography", "Web_Cache_Security",
    ],
    "api": [
        "REST_Security", "REST_Assessment", "GraphQL", "gRPC_Security", "WebSocket_Security", "Webhook_Security",
        "Web_Service_Security",
    ],
    "supply": [
        "CI_CD_Security", "GitHub_Actions_Security", "Docker_Security", "NodeJS_Docker", "Kubernetes_Security",
        "Infrastructure_as_Code_Security", "Secrets_Management", "Software_Supply_Chain_Security", "Dependency_Graph_SBOM",
        "Vulnerable_Dependency_Management", "NPM_Security", "Serverless_FaaS_Security", "Secure_Cloud_Architecture",
        "Network_Segmentation", "Zero_Trust_Architecture", "Subdomain_Takeover_Prevention", "Database_Security",
    ],
    "arch": [
        "Abuse_Case", "Attack_Surface_Analysis", "Business_Logic_Security", "Error_Handling", "Logging", "Logging_Vocabulary",
        "Denial_of_Service", "Secure_Code_Review", "Secure_Product_Design", "Security_Terminology", "Threat_Modeling",
        "User_Privacy_Protection", "Vulnerability_Disclosure", "Virtual_Patching", "Legacy_Application_Management",
        "Microservices_Security", "Microservices_based_Security_Arch_Doc",
        # Specific domains, folded into architecture / process (spec: 10 clusters, not 11).
        "Bot_Management_and_Anti-Automation", "Automotive_Security", "Drone_Security", "Mobile_Application_Security",
        "Third_Party_Payment_Gateway_Integration",
    ],
}

WSTG_GROUPS: dict[str, ClusterId] = {
    "ATHN": "auth", "SESS": "auth", "IDNT": "auth",
    "ATHZ": "authz",
    "INPV": "inj",
    "CLNT": "browser",
    "CRYP": "transport",
    "APIT": "api",
    "INFO": "arch", "CONF": "arch", "ERRH": "arch", "BUSL": "arch",
}


class UnmappedDocuments(Exception):
    def __init__(self, keys: list[str]):
        self.keys = keys
        super().__init__(f"{len(keys)} document(s) match no cluster rule: {', '.join(keys)}")


def _name(doc_key: str) -> str:
    return doc_key.removesuffix("_Cheat_Sheet")


def build_cluster_map(manifest: Manifest) -> ClusterMap:
    """The starting map for a snapshot; every cheat sheet must match exactly one rule."""
    by_name = {name: cluster for cluster, names in RULES.items() for name in names}
    documents: dict[str, ClusterId] = {}
    unmapped: list[str] = []
    for doc in manifest.documents:
        if doc.doc_key == WSTG_KEY:
            continue
        cluster = by_name.get(_name(doc.doc_key))
        if cluster is None:
            unmapped.append(doc.doc_key)
        else:
            documents[doc.doc_key] = cluster
    if unmapped:
        raise UnmappedDocuments(unmapped)
    return ClusterMap(clusters=CLUSTER_NAMES, documents=documents, wstg_groups=WSTG_GROUPS, wstg_front_matter="arch")
