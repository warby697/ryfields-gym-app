export type EmailTemplate = {
    name: string;
    subject: string;
    body: string;
    category: string;
};
export declare const PASSWORD_RESET_TEMPLATE: EmailTemplate;
export declare function fillTemplate(value: string, variables: Record<string, string>): string;
export declare function ryfieldsResetLink(firebaseLink: string, baseUrl: string): string;
export declare function emailHtml(body: string, variables: Record<string, string>): string;
export declare function sendEmail(input: {
    to: string;
    from: string;
    apiKey: string;
    subject: string;
    text: string;
    html: string;
}): Promise<{
    id: string;
}>;
