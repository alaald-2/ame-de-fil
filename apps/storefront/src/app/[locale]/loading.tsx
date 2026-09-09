import { Container, Spinner } from "@ame-de-fil/ui";

export default function Loading() {
  return (
    <Container className="flex justify-center py-24">
      <Spinner />
    </Container>
  );
}
